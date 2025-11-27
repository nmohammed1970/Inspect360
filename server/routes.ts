// Backend API routes for Inspect360
import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID, createHash } from "crypto";
import { promises as fs } from "fs";
import { storage } from "./storage";

/**
 * Detect file MIME type from file buffer using magic bytes
 * Returns the detected MIME type or 'application/octet-stream' if unknown
 */
function detectFileMimeType(buffer: Buffer): string {
  // Validate buffer
  if (!buffer || buffer.length < 4) {
    return 'application/octet-stream';
  }

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 or 47 49 46 39
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && 
      (buffer[3] === 0x38 || buffer[3] === 0x39)) {
    return 'image/gif';
  }

  // WebP: RIFF...WEBP
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }

  // Microsoft Office files (DOCX, XLSX, PPTX): PK (ZIP signature)
  // These are ZIP archives, so check for ZIP signature and then look inside
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    // Read more bytes to check for Office file signatures
    const bufferStr = buffer.toString('utf8', 0, Math.min(buffer.length, 2000));
    if (bufferStr.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (bufferStr.includes('xl/') || bufferStr.includes('worksheets/')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (bufferStr.includes('ppt/')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    // Generic ZIP
    return 'application/zip';
  }

  // Microsoft Office 97-2003 (DOC, XLS, PPT): OLE compound document
  // D0 CF 11 E0 A1 B1 1A E1
  if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
    // Try to determine which Office type
    const bufferStr = buffer.toString('utf8', 0, Math.min(buffer.length, 2000));
    if (bufferStr.includes('WordDocument')) {
      return 'application/msword';
    }
    if (bufferStr.includes('Workbook') || bufferStr.includes('Worksheet')) {
      return 'application/vnd.ms-excel';
    }
    return 'application/msword'; // Default to Word
  }

  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'image/bmp';
  }

  return 'application/octet-stream';
}

/**
 * Detect image MIME type from file buffer using magic bytes
 * Returns a valid image MIME type (always starts with 'image/')
 */
function detectImageMimeType(buffer: Buffer): string {
  // Validate buffer
  if (!buffer || buffer.length === 0) {
    console.warn('[detectImageMimeType] Empty buffer, defaulting to image/jpeg');
    return 'image/jpeg';
  }

  // Check file signatures (magic bytes)
  if (buffer.length < 4) {
    console.warn('[detectImageMimeType] Buffer too small, defaulting to image/jpeg');
    return 'image/jpeg';
  }

  // JPEG: FF D8 FF (can be followed by E0, E1, etc.)
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 (GIF8) or 47 49 46 39 (GIF9)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && 
      (buffer[3] === 0x38 || buffer[3] === 0x39)) {
    return 'image/gif';
  }

  // WebP: Check for RIFF...WEBP
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }

  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return 'image/bmp';
  }

  // Default to JPEG if we can't detect (most common image format)
  // This ensures we always return a valid image MIME type
  console.warn('[detectImageMimeType] Could not detect image type from magic bytes, defaulting to image/jpeg. First bytes:', 
    Array.from(buffer.slice(0, 8)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
  return 'image/jpeg';
}
import { setupAuth, isAuthenticated, requireRole, hashPassword, comparePasswords } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { db } from "./db";
import { eq, and, lt, gt, desc } from "drizzle-orm";
import { getUncachableStripeClient, getStripeSecretKey } from "./stripeClient";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import { z } from "zod";
import multer from "multer";
import { format } from "date-fns";
import { devRouter } from "./devRoutes";
import { sendInspectionCompleteEmail, sendTeamWorkOrderNotification, sendContractorWorkOrderNotification, sendComparisonReportToFinance } from "./resend";
import { DEFAULT_TEMPLATES } from "./defaultTemplates";
import { generateInspectionPDF } from "./pdfService";
import { extractTextFromFile, findRelevantChunks } from "./documentProcessor";
import {
  insertBlockSchema,
  insertContactSchema,
  insertInventoryTemplateSchema,
  insertInventorySchema,
  insertInventoryItemSchema,
  insertWorkOrderSchema,
  insertWorkLogSchema,
  insertAssetInventorySchema,
  insertTagSchema,
  insertTemplateCategorySchema,
  insertInspectionTemplateSchema,
  insertTemplateInventoryLinkSchema,
  insertInspectionEntrySchema,
  insertAiImageAnalysisSchema,
  insertPropertySchema,
  insertComplianceDocumentSchema,
  insertMaintenanceRequestSchema,
  insertInspectionSchema,
  createOrganizationSchema,
  createTeamMemberSchema,
  updateTeamMemberSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  updateSelfProfileSchema,
  updatePropertySchema,
  updateComplianceDocumentSchema,
  updateMaintenanceRequestSchema,
  analyzePhotoSchema,
  inspectFieldSchema,
  generateComparisonSchema,
  analyzeMaintenanceImageSchema,
  updateContactSchema,
  updateTagSchema,
  updateDashboardPreferencesSchema,
  updateTemplateCategorySchema,
  updateInspectionSchema,
  updateBlockSchema,
  insertMessageTemplateSchema,
  updateMessageTemplateSchema,
  insertTenantAssignmentSchema,
  updateTenantAssignmentSchema,
  quickAddAssetSchema,
  quickAddMaintenanceSchema,
  quickUpdateAssetSchema,
  maintenanceRequests,
  teams,
  teamMembers,
  teamCategories,
  insertPlanSchema,
  insertCreditBundleSchema,
  insertCountryPricingOverrideSchema,
  creditBatches,
  subscriptions
} from "@shared/schema";

// Initialize OpenAI using Replit AI Integrations (lazy initialization)
// Using gpt-5 for vision analysis - the newest OpenAI model (released August 7, 2025), supports images and provides excellent results

// Detect if running in a cloud/sandboxed environment (AWS Lambda, Vercel, Netlify, Replit)
const isCloudEnvironment = !!(
  process.env.AWS_LAMBDA_FUNCTION_NAME || 
  process.env.VERCEL || 
  process.env.NETLIFY || 
  process.env.REPLIT_ENVIRONMENT ||
  process.env.REPLIT_CLUSTER
);

// Helper function to launch Puppeteer with appropriate configuration
async function launchPuppeteerBrowser() {
  if (isCloudEnvironment) {
    // Cloud/sandboxed environment (Replit, AWS Lambda, etc.) - use @sparticuz/chromium
    const chromium = await import("@sparticuz/chromium");
    const puppeteer = await import("puppeteer-core");
    
    return await puppeteer.default.launch({
      args: [
        ...chromium.default.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process',
      ],
      executablePath: await chromium.default.executablePath(),
      headless: true,
    });
  } else {
    // Local development - use Puppeteer's bundled Chromium
    const puppeteer = await import("puppeteer");
    return await puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
    });
  }
}

/**
 * Normalizes content for OpenAI Responses API format.
 * Converts legacy chat.completions format to responses.create format.
 * @param content - Array of content items with type "text" or "image_url"
 * @returns Array of normalized content items with type "input_text" or "input_image"
 * @throws Error if content type is not supported
 */
function normalizeApiContent(content: any[]): any[] {
  return content.map((item: any, index: number) => {
    if (item.type === "text") {
      return { type: "input_text", text: item.text };
    } else if (item.type === "image_url") {
      // Extract URL from object or use directly if already a string
      const url = typeof item.image_url === 'string' ? item.image_url : item.image_url?.url;
      if (!url) {
        throw new Error(`[normalizeApiContent] Missing image URL at index ${index}`);
      }
      return { type: "input_image", image_url: url };
    } else if (item.type === "input_text") {
      // Already normalized - pass through
      return item;
    } else if (item.type === "input_image") {
      // Already normalized - ensure URL is a string
      if (typeof item.image_url !== 'string') {
        throw new Error(`[normalizeApiContent] image_url must be a string at index ${index}, got ${typeof item.image_url}`);
      }
      return item;
    } else {
      throw new Error(`[normalizeApiContent] Unsupported content type at index ${index}: ${item.type}`);
    }
  });
}
let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      throw new Error("OpenAI integration not configured. Please set up the AI Integrations.");
    }
    openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    });
  }
  return openai;
}

/**
 * Background process to analyze all inspection entries with photos using AI.
 * Updates progress on the inspection record as each entry is processed.
 */
async function processInspectionAIAnalysis(
  inspectionId: string,
  entriesWithPhotos: any[],
  inspection: any,
  organization: any,
  organizationId: string
): Promise<void> {
  console.log(`[FullInspectAI] Starting background analysis for inspection ${inspectionId} with ${entriesWithPhotos.length} entries`);
  
  const objectStorageService = new ObjectStorageService();
  
  // Get template settings for AI configuration
  let aiMaxWords: number = 150;
  let aiInstruction: string = "";
  
  if (inspection.templateId) {
    const template = await storage.getInspectionTemplate(inspection.templateId);
    if (template) {
      aiMaxWords = template.aiMaxWords ?? organization.defaultAiMaxWords ?? 150;
      aiInstruction = template.aiInstruction || organization.defaultAiInstruction || "";
    }
  } else {
    aiMaxWords = organization.defaultAiMaxWords ?? 150;
    aiInstruction = organization.defaultAiInstruction || "";
  }
  
  let processedCount = 0;
  let totalCreditsUsed = 0;
  
  for (const entry of entriesWithPhotos) {
    try {
      console.log(`[FullInspectAI] Processing entry ${processedCount + 1}/${entriesWithPhotos.length}: ${entry.fieldKey}`);
      
      // Convert photos to base64 data URLs
      const photoUrls: string[] = [];
      for (const photo of entry.photos) {
        try {
          if (photo.startsWith("http")) {
            photoUrls.push(photo);
            continue;
          }
          
          const photoPath = photo.startsWith('/objects/') ? photo : `/objects/${photo}`;
          const objectFile = await objectStorageService.getObjectEntityFile(photoPath);
          const fileBuffer = await fs.readFile(objectFile.name);
          
          let contentType = detectImageMimeType(fileBuffer);
          if (!contentType || !contentType.startsWith('image/')) {
            contentType = 'image/jpeg';
          }
          
          const base64Data = fileBuffer.toString('base64');
          const dataUrl = `data:${contentType};base64,${base64Data}`;
          photoUrls.push(dataUrl);
        } catch (photoError: any) {
          console.error(`[FullInspectAI] Error loading photo ${photo}:`, photoError.message);
          // Skip this photo but continue with others
        }
      }
      
      if (photoUrls.length === 0) {
        console.log(`[FullInspectAI] No valid photos for entry ${entry.fieldKey}, skipping`);
        processedCount++;
        continue;
      }
      
      // Build the field label from sectionRef and fieldKey
      const fieldLabel = `${entry.sectionRef}${entry.itemRef ? ` - ${entry.itemRef}` : ''} - ${entry.fieldKey}`;
      
      // Build prompt
      let promptText: string;
      if (aiInstruction) {
        promptText = `${aiInstruction}

Focus SPECIFICALLY on: "${fieldLabel}"

I have ${photoUrls.length} image(s) to analyze. Provide your assessment for "${fieldLabel}".

IMPORTANT FORMATTING RULES:
- Keep your response under ${aiMaxWords} words
- Write in plain text only - do NOT use asterisks (*), hash symbols (#), bullet points, or numbered lists
- Do NOT use any markdown formatting
- Do NOT include emojis
- Write in professional, flowing paragraphs`;
      } else {
        promptText = `You are analyzing a property inspection photo. Focus SPECIFICALLY on: "${fieldLabel}"

IMPORTANT: The photo may show an entire room or area, but you must focus your analysis ONLY on "${fieldLabel}". Ignore other elements in the photo that are not directly related to this inspection point.

I have ${photoUrls.length} image(s). Provide a concise inspection report for "${fieldLabel}" covering:
- Overall condition assessment
- Any visible damage, defects, or wear
- Cleanliness and maintenance issues
- Notable features or observations
- Recommendations (if any)

IMPORTANT FORMATTING RULES:
- Keep your response under ${aiMaxWords} words
- Write in plain text only - do NOT use asterisks (*), hash symbols (#), bullet points, or numbered lists
- Do NOT use any markdown formatting
- Do NOT include emojis
- Write in professional, flowing paragraphs

Be thorough but concise, specific, and objective about the ${fieldLabel}. Do not comment on items outside the scope of "${fieldLabel}". This will be used in a professional property inspection report.`;
      }
      
      // Build content array
      const content: any[] = [{ type: "text", text: promptText }];
      photoUrls.forEach(url => {
        content.push({ type: "image_url", image_url: url });
      });
      
      // Call OpenAI Vision API
      const response = await getOpenAI().responses.create({
        model: "gpt-5",
        input: [{ role: "user", content: normalizeApiContent(content) }],
        max_output_tokens: 10000,
      });
      
      // Extract analysis text from response
      let analysis: string | null = null;
      
      if (response.output_text) {
        analysis = response.output_text;
      } else if (response.output && response.output.length > 0) {
        for (const outputItem of response.output) {
          if ((outputItem as any).content && Array.isArray((outputItem as any).content)) {
            for (const contentItem of (outputItem as any).content) {
              if (contentItem.type === 'output_text' && contentItem.text) {
                analysis = contentItem.text;
                break;
              }
              if (contentItem.type === 'text' && contentItem.text) {
                analysis = contentItem.text;
                break;
              }
            }
            if (analysis) break;
          }
        }
      }
      
      if (!analysis || analysis.trim().length === 0) {
        console.error(`[FullInspectAI] Empty analysis for entry ${entry.fieldKey}`);
        processedCount++;
        await storage.updateInspection(inspectionId, {
          aiAnalysisProgress: processedCount
        } as any);
        continue;
      }
      
      // Strip forbidden characters
      analysis = analysis
        .replace(/\*+/g, '')
        .replace(/#+/g, '')
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      // Update entry note - append if existing notes
      const existingNote = entry.note || "";
      const aiPrefix = "[AI Analysis]\n";
      const newNote = existingNote 
        ? `${existingNote}\n\n${aiPrefix}${analysis}`
        : `${aiPrefix}${analysis}`;
      
      await storage.updateInspectionEntry(entry.id, { note: newNote });
      
      // Deduct credit
      await storage.updateOrganizationCredits(
        organization.id,
        (organization.creditsRemaining ?? 0) - 1 - totalCreditsUsed
      );
      totalCreditsUsed++;
      
      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: -1,
        type: "inspection",
        description: `InspectAI full report analysis: ${fieldLabel}`,
      });
      
      processedCount++;
      
      // Update progress
      await storage.updateInspection(inspectionId, {
        aiAnalysisProgress: processedCount
      } as any);
      
      console.log(`[FullInspectAI] Completed entry ${processedCount}/${entriesWithPhotos.length}: ${entry.fieldKey}`);
      
    } catch (entryError: any) {
      console.error(`[FullInspectAI] Error processing entry ${entry.fieldKey}:`, entryError.message);
      // Continue with next entry rather than failing completely
      processedCount++;
      await storage.updateInspection(inspectionId, {
        aiAnalysisProgress: processedCount
      } as any);
    }
  }
  
  // Mark as completed
  await storage.updateInspection(inspectionId, {
    aiAnalysisStatus: "completed",
    aiAnalysisProgress: entriesWithPhotos.length,
    aiAnalysisError: null
  } as any);
  
  console.log(`[FullInspectAI] Completed analysis for inspection ${inspectionId}. Processed ${processedCount} entries, used ${totalCreditsUsed} credits.`);
}

// Helper function to get the base URL from request, respecting proxy headers
function getBaseUrl(req: any): string {
  // 1. Check environment variable first
  if (process.env.BASE_URL) {
    console.log(`[getBaseUrl] Using BASE_URL from env: ${process.env.BASE_URL}`);
    return process.env.BASE_URL;
  }

  // 2. Check for proxy headers (X-Forwarded-Proto and X-Forwarded-Host)
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  if (forwardedProto && forwardedHost) {
    const url = `${forwardedProto}://${forwardedHost}`;
    console.log(`[getBaseUrl] Using forwarded headers: ${url}`);
    return url;
  }

  // 3. Check request origin header
  if (req.headers.origin) {
    try {
      const url = new URL(req.headers.origin).origin;
      console.log(`[getBaseUrl] Using origin header: ${url}`);
      return url;
    } catch (e) {
      // Invalid origin, continue to next option
    }
  }

  // 4. Check referer header (often more reliable than origin)
  if (req.headers.referer || req.headers.referrer) {
    try {
      const referer = req.headers.referer || req.headers.referrer;
      const url = new URL(referer).origin;
      console.log(`[getBaseUrl] Using referer header: ${url}`);
      return url;
    } catch (e) {
      // Invalid referer, continue to next option
    }
  }

  // 5. Use req.protocol and req.get('host') (works with trust proxy)
  const protocol = req.protocol || 'http';
  const host = req.get('host');
  if (host) {
    const url = `${protocol}://${host}`;
    console.log(`[getBaseUrl] Using req.protocol/host: ${url}`);
    return url;
  }

  // 6. Fallback to localhost
  const fallback = `http://localhost:${process.env.PORT || 5005}`;
  console.log(`[getBaseUrl] Using fallback: ${fallback}`);
  console.log(`[getBaseUrl] Debug info:`, {
    hasOrigin: !!req.headers.origin,
    hasReferer: !!(req.headers.referer || req.headers.referrer),
    hasForwardedProto: !!forwardedProto,
    hasForwardedHost: !!forwardedHost,
    protocol: req.protocol,
    host: req.get('host'),
    headers: {
      origin: req.headers.origin,
      referer: req.headers.referer || req.headers.referrer,
      'x-forwarded-proto': forwardedProto,
      'x-forwarded-host': forwardedHost,
    }
  });
  return fallback;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== CONFIG ROUTES ====================
  
  // Get Google Maps API key (public endpoint, but API key is restricted by domain in Google Console)
  app.get("/api/config/google-maps-key", async (req: any, res) => {
    try {
      // Check all possible ways the key might be set
      const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || 
                     process.env['GOOGLE_MAPS_API_KEY']?.trim();
      
      console.log('[Google Maps API] Checking API key:', {
        exists: !!apiKey,
        length: apiKey?.length || 0,
        startsWith: apiKey?.substring(0, 10) || 'N/A',
        rawEnvValue: process.env.GOOGLE_MAPS_API_KEY ? 'present' : 'missing',
        allEnvKeys: Object.keys(process.env).filter(k => k.includes('GOOGLE')).join(', ')
      });
      
      if (!apiKey || apiKey.length === 0) {
        console.warn('[Google Maps API] API key not configured in environment variables');
        console.warn('[Google Maps API] Available env vars with GOOGLE:', 
          Object.keys(process.env).filter(k => k.toUpperCase().includes('GOOGLE')));
        // Return 200 with null to indicate API key is not configured
        // This allows the client to gracefully handle missing API key
        return res.json({ apiKey: null, configured: false });
      }
      console.log('[Google Maps API] API key found, returning to client (length:', apiKey.length, ')');
      res.json({ apiKey, configured: true });
    } catch (error) {
      console.error("Error fetching Google Maps API key:", error);
      res.status(500).json({ error: "Failed to fetch API key", apiKey: null, configured: false });
    }
  });
  // Auth middleware
  await setupAuth(app);

  // Configure multer for file uploads (memory storage for local file system)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB limit
    },
  });

  // ==================== DEV ROUTES (Development Only) ====================
  if (process.env.NODE_ENV === "development") {
    app.use("/api/dev", devRouter);
  }

  // ==================== AUTH ROUTES ====================
  
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Include organization info if user belongs to one
      let organization = null;
      if (user.organizationId) {
        organization = await storage.getOrganization(user.organizationId);
      }
      
      // Exclude password from response for security
      const { password, ...userWithoutPassword } = user;
      res.json({ ...userWithoutPassword, organization });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get('/api/auth/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Exclude password from response for security
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch('/api/auth/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Validate request body using the self-profile update schema
      const validation = updateSelfProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      if (Object.keys(validation.data).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updatedUser = await storage.updateUser(userId, validation.data);
      
      // Exclude password from response
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Complete onboarding for first-time users
  app.post('/api/auth/complete-onboarding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      const updatedUser = await storage.updateUser(userId, { onboardingCompleted: true });
      
      // Exclude password from response
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // ==================== ORGANIZATION ROUTES ====================
  
  app.post("/api/organizations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Validate request body
      const validation = createOrganizationSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      // Get current user data
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create organization
      const organization = await storage.createOrganization({
        name: validation.data.name,
        ownerId: userId,
        creditsRemaining: 5, // Give 5 free credits to start
      });

      // Update user with organization ID and set role to owner (preserving all existing fields)
      await storage.upsertUser({
        ...user,
        organizationId: organization.id,
        role: "owner",
      });

      // Create initial credit transaction for free credits
      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: 5,
        type: "purchase",
        description: "Welcome credits",
      });

      // Create default inspection templates (Check In and Check Out)
      // Use defensive error handling so org creation succeeds even if template seeding fails
      try {
        for (const template of DEFAULT_TEMPLATES) {
          await storage.createInspectionTemplate({
            organizationId: organization.id,
            name: template.name,
            description: template.description,
            scope: template.scope,
            version: 1,
            isActive: true,
            structureJson: template.structureJson,
            categoryId: template.categoryId,
            createdBy: userId,
          });
        }
        console.log(`✓ Created ${DEFAULT_TEMPLATES.length} default templates for organization ${organization.id}`);
      } catch (templateError) {
        // Log the error but don't fail the entire organization creation
        console.error("Warning: Failed to create default templates, but organization was created successfully:", templateError);
      }

      // Create sample data for new organization (Block A, Property A, Joe Bloggs tenant)
      // Use timestamp-based unique suffix for idempotency
      try {
        const uniqueSuffix = Date.now().toString(36); // Convert timestamp to base36 for shorter suffix
        
        // Create Block A
        const blockA = await storage.createBlock({
          organizationId: organization.id,
          name: "Block A",
          address: "123 Sample Street, Sample City, SC 12345",
          notes: "Sample block created automatically for demonstration purposes",
        });
        console.log(`✓ Created sample Block A for organization ${organization.id}`);

        // Create Property A linked to Block A
        const propertyA = await storage.createProperty({
          organizationId: organization.id,
          blockId: blockA.id,
          name: "Property A",
          address: "Unit 101, Block A, 123 Sample Street, Sample City, SC 12345",
          sqft: 850,
        });
        console.log(`✓ Created sample Property A for organization ${organization.id}`);

        // Create sample tenant user "Joe Bloggs" with unique timestamp suffix
        const tenantPassword = await hashPassword("password123");
        const joeBloggs = await storage.createUser({
          email: `joe.bloggs+${uniqueSuffix}@inspect360.demo`,
          username: `joe_bloggs_${uniqueSuffix}`,
          password: tenantPassword,
          firstName: "Joe",
          lastName: "Bloggs",
          role: "tenant",
          organizationId: organization.id,
          isActive: true,
        });
        console.log(`✓ Created sample tenant Joe Bloggs (${joeBloggs.email}) for organization ${organization.id}`);

        // Create contact record for Joe Bloggs
        await storage.createContact({
          organizationId: organization.id,
          type: 'tenant',
          firstName: "Joe",
          lastName: "Bloggs",
          email: `joe.bloggs+${uniqueSuffix}@inspect360.demo`,
          phone: "+44 7700 900123",
          linkedUserId: joeBloggs.id,
          notes: "Sample tenant contact created automatically for demonstration purposes",
        });
        console.log(`✓ Created contact record for Joe Bloggs`);

        // Create tenant assignment linking Joe Bloggs to Property A
        const tenantAssignment = await storage.createTenantAssignment({
          organizationId: organization.id,
          propertyId: propertyA.id,
          tenantId: joeBloggs.id,
          leaseStartDate: new Date(),
          leaseEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          monthlyRent: "1200.00",
          depositAmount: "1200.00",
          isActive: true,
          notes: "Sample tenant assignment created for demonstration purposes",
        });
        console.log(`✓ Created tenant assignment for Joe Bloggs in Property A`);
        console.log(`✓ Sample data setup complete - Block A, Property A, and tenant Joe Bloggs created successfully`);
      } catch (sampleDataError) {
        // Log detailed error for debugging but don't fail the organization creation
        console.error("Warning: Failed to create sample data (organization was still created successfully):", {
          error: sampleDataError instanceof Error ? sampleDataError.message : String(sampleDataError),
          organizationId: organization.id,
        });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.get("/api/organizations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const organizationId = req.params.id;
      
      const user = await storage.getUser(userId);
      if (!user?.organizationId || user.organizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // Update organization branding (white-label settings)
  app.patch("/api/organizations/:id/branding", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const organizationId = req.params.id;
      
      const user = await storage.getUser(userId);
      if (!user?.organizationId || user.organizationId !== organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { logoUrl, brandingName, brandingEmail, brandingPhone, brandingAddress, brandingWebsite, financeEmail } = req.body;

      const organization = await storage.updateOrganization(organizationId, {
        logoUrl: logoUrl || null,
        brandingName: brandingName || null,
        brandingEmail: brandingEmail || null,
        brandingPhone: brandingPhone || null,
        brandingAddress: brandingAddress || null,
        brandingWebsite: brandingWebsite || null,
        financeEmail: financeEmail || null,
      });

      res.json(organization);
    } catch (error) {
      console.error("Error updating organization branding:", error);
      res.status(500).json({ message: "Failed to update organization branding" });
    }
  });

  // ==================== TEAM MANAGEMENT ROUTES ====================
  
  app.get("/api/team", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      const organizationId = user.organizationId;

      // Fetch all users but exclude tenants (they should appear in Contacts instead)
      const allUsers = await storage.getUsersByOrganization(organizationId);
      const teamMembers = allUsers.filter(u => u.role !== 'tenant');
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.patch("/api/team/:userId/role", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const requesterId = req.user.id;
      const requester = await storage.getUser(requesterId);
      
      if (!requester?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      const { userId } = req.params;
      const organizationId = requester.organizationId;

      // Validate request body
      const validation = updateUserRoleSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      // Verify the user belongs to the same organization
      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.organizationId !== organizationId) {
        return res.status(403).json({ message: "User not found in your organization" });
      }

      // Prevent changing own role
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Cannot change your own role" });
      }

      const updatedUser = await storage.updateUserRole(userId, validation.data.role);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Toggle user active status
  app.patch("/api/team/:userId/status", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const requesterId = req.user.id;
      const requester = await storage.getUser(requesterId);
      
      if (!requester?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      const { userId } = req.params;

      // Validate request body
      const validation = updateUserStatusSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      // Verify the user belongs to the same organization
      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.organizationId !== requester.organizationId) {
        return res.status(403).json({ message: "User not found in your organization" });
      }

      // Prevent disabling own account
      if (userId === req.user.id) {
        return res.status(400).json({ message: "Cannot change your own account status" });
      }

      const updatedUser = await storage.updateUser(userId, { isActive: validation.data.isActive });
      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  app.post("/api/team", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const requesterId = req.user.id;
      const requester = await storage.getUser(requesterId);
      
      if (!requester?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Validate request body
      const validation = createTeamMemberSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { email, firstName, lastName, username, password, role, phone, address, skills, education, profileImageUrl, certificateUrls } = validation.data;

      // Hash password before creating user
      const hashedPassword = await hashPassword(password);

      // Create team member with organization ID
      // NOTE: This creates the user in the same 'users' table where all user data is stored.
      // For tenants, the email and password set here will be used as login credentials for the tenant portal.
      const newUser = await storage.createUser({
        email,
        firstName,
        lastName,
        username,
        password: hashedPassword, // This password will be used for tenant portal login
        role, // For tenants, this will be "tenant"
        phone,
        address,
        skills,
        education,
        profileImageUrl,
        certificateUrls,
        organizationId: requester.organizationId,
      });

      // If the user is a tenant, automatically create a corresponding contact
      if (role === 'tenant') {
        try {
          await storage.createContact({
            organizationId: requester.organizationId,
            type: 'tenant',
            firstName: firstName || '',
            lastName: lastName || '',
            email: email,
            phone: phone || undefined,
            profileImageUrl: profileImageUrl || undefined,
            linkedUserId: newUser.id,
            notes: 'Automatically created from tenant user',
          });
          console.log(`✓ Created contact record for tenant user ${newUser.id}`);
        } catch (contactError) {
          // Log error but don't fail the user creation
          console.error(`Warning: Failed to create contact for tenant user ${newUser.id}:`, contactError);
        }
      }

      // Don't return password
      const { password: _, ...userWithoutPassword } = newUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Error creating team member:", error);
      if (error.message?.includes("duplicate") || error.message?.includes("unique")) {
        res.status(400).json({ message: "Email or username already exists" });
      } else {
        res.status(500).json({ message: "Failed to create team member" });
      }
    }
  });

  app.patch("/api/team/:userId", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const requesterId = req.user.id;
      const requester = await storage.getUser(requesterId);
      
      if (!requester?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      const { userId } = req.params;

      // Validate request body
      const validation = updateTeamMemberSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      // Verify the user belongs to the same organization
      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.organizationId !== requester.organizationId) {
        return res.status(403).json({ message: "User not found in your organization" });
      }

      if (Object.keys(validation.data).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updatedUser = await storage.updateUser(userId, validation.data);
      
      // Don't return password
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error updating team member:", error);
      res.status(500).json({ message: "Failed to update team member" });
    }
  });

  // ==================== CONTACT ROUTES ====================

  app.get("/api/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contacts = await storage.getContactsByOrganization(user.organizationId);
      
      // Fetch tags for each contact
      const contactsWithTags = await Promise.all(
        contacts.map(async (contact) => {
          const tags = await storage.getTagsForContact(contact.id);
          return { ...contact, tags };
        })
      );
      
      res.json(contactsWithTags);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contact = await storage.getContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      if (contact.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(contact);
    } catch (error) {
      console.error("Error fetching contact:", error);
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const validation = insertContactSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid request data", details: validation.error });
      }
      
      const contact = await storage.createContact({
        ...validation.data,
        organizationId: user.organizationId
      });
      
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  // Sync tenant users to contacts (migration endpoint for existing tenants)
  app.post("/api/contacts/sync-tenants", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      // Get all tenant users in the organization
      const allUsers = await storage.getUsersByOrganization(user.organizationId);
      const tenantUsers = allUsers.filter(u => u.role === 'tenant');
      
      // Get all existing contacts to check for linkedUserId
      const existingContacts = await storage.getContactsByOrganization(user.organizationId);
      const linkedUserIds = new Set(
        existingContacts
          .filter(c => c.linkedUserId)
          .map(c => c.linkedUserId)
      );
      
      // Create contacts for tenant users that don't have one yet
      const results = {
        total: tenantUsers.length,
        created: 0,
        skipped: 0,
        errors: [] as string[],
      };
      
      for (const tenant of tenantUsers) {
        if (linkedUserIds.has(tenant.id)) {
          results.skipped++;
          continue;
        }
        
        try {
          await storage.createContact({
            organizationId: user.organizationId,
            type: 'tenant',
            firstName: tenant.firstName || '',
            lastName: tenant.lastName || '',
            email: tenant.email,
            phone: tenant.phone || undefined,
            profileImageUrl: tenant.profileImageUrl || undefined,
            linkedUserId: tenant.id,
            notes: 'Migrated from tenant user',
          });
          results.created++;
          console.log(`✓ Created contact for tenant user ${tenant.id}`);
        } catch (contactError) {
          results.errors.push(`Failed to create contact for ${tenant.email}: ${contactError instanceof Error ? contactError.message : String(contactError)}`);
          console.error(`Error creating contact for tenant ${tenant.id}:`, contactError);
        }
      }
      
      res.json(results);
    } catch (error) {
      console.error("Error syncing tenants to contacts:", error);
      res.status(500).json({ error: "Failed to sync tenants" });
    }
  });

  app.patch("/api/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contact = await storage.getContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      if (contact.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Validate request body
      const validation = updateContactSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }
      
      const updatedContact = await storage.updateContact(req.params.id, validation.data);
      res.json(updatedContact);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  app.delete("/api/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }
      
      const contact = await storage.getContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      if (contact.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // ==================== PROPERTY ROUTES ====================
  
  app.post("/api/properties", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }
      
      // Validate request body
      const validation = insertPropertySchema.omit({ organizationId: true }).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { name, address, blockId } = validation.data;

      const property = await storage.createProperty({
        organizationId: user.organizationId,
        name,
        address,
        blockId: blockId || null,
      });

      res.json(property);
    } catch (error) {
      console.error("Error creating property:", error);
      res.status(500).json({ message: "Failed to create property" });
    }
  });

  app.get("/api/properties", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.json([]);
      }

      const properties = await storage.getPropertiesByOrganization(user.organizationId);
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  app.get("/api/properties/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const property = await storage.getProperty(id);
      
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      res.json(property);
    } catch (error) {
      console.error("Error fetching property:", error);
      res.status(500).json({ message: "Failed to fetch property" });
    }
  });

  // Update property
  app.patch("/api/properties/:id", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getProperty(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Validate request body (partial update) with Zod
      const parseResult = updatePropertySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: parseResult.error.errors 
        });
      }

      const updates = parseResult.data;
      const updateData: any = {};
      
      // Only include fields that are provided in the update
      if (updates.name !== undefined) {
        updateData.name = updates.name;
      }
      if (updates.address !== undefined) {
        updateData.address = updates.address;
      }
      if (updates.blockId !== undefined) {
        // Allow setting blockId to null to remove block assignment
        // Convert null string to actual null
        updateData.blockId = updates.blockId === null || updates.blockId === "null" ? null : updates.blockId;
      }
      
      const property = await storage.updateProperty(req.params.id, updateData);
      
      res.json(property);
    } catch (error: any) {
      console.error("Error updating property:", error);
      res.status(500).json({ error: "Failed to update property" });
    }
  });

  // Get property stats
  app.get("/api/properties/:id/stats", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const property = await storage.getProperty(id);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Get inspections for this property
      const inspections = await storage.getInspectionsByProperty(id);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Overdue: scheduled date is before today
      const overdueInspections = inspections.filter(i => 
        i.status === 'scheduled' && i.scheduledDate && new Date(i.scheduledDate) < today
      ).length;
      
      // Due soon: scheduled date is today or in the near future (next 7 days)
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const dueInspections = inspections.filter(i => 
        i.status === 'scheduled' && i.scheduledDate && 
        new Date(i.scheduledDate) >= today &&
        new Date(i.scheduledDate) <= weekFromNow
      ).length;

      // Get compliance docs for this property
      const allComplianceDocs = await storage.getComplianceDocuments(user.organizationId);
      const complianceDocs = allComplianceDocs.filter((d: any) => d.propertyId === id);
      const validDocs = complianceDocs.filter((d: any) => {
        if (!d.expiryDate) return true;
        return new Date(d.expiryDate) > now;
      }).length;
      const complianceRate = complianceDocs.length > 0 
        ? Math.round((validDocs / complianceDocs.length) * 100)
        : 100;

      // Get maintenance requests
      const maintenanceRequests = await storage.getMaintenanceRequestsByProperty(id);
      const openRequests = maintenanceRequests.filter(m => 
        m.status !== 'completed' && m.status !== 'closed'
      ).length;

      // Get inventory count
      const inventory = await storage.getAssetInventoryByProperty(id);
      
      // Get tenants
      const tenants = await storage.getUsersByOrganizationAndRole(user.organizationId, "tenant");
      const propertyTenants = tenants.filter((t: any) => t.propertyId === id);

      res.json({
        occupancyStatus: propertyTenants.length > 0 ? `${propertyTenants.length} Tenant${propertyTenants.length > 1 ? 's' : ''}` : 'Vacant',
        complianceRate,
        dueInspections,
        overdueInspections,
        maintenanceRequests: openRequests,
        inventoryCount: inventory.length,
      });
    } catch (error) {
      console.error("Error fetching property stats:", error);
      res.status(500).json({ message: "Failed to fetch property stats" });
    }
  });

  // Get property tenants
  app.get("/api/properties/:id/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const property = await storage.getProperty(id);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Use tenant_assignments table to get property tenants with organization isolation
      const tenants = await storage.getTenantAssignmentsByProperty(id, user.organizationId);

      res.json(tenants);
    } catch (error) {
      console.error("Error fetching property tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  // Get property inspections
  app.get("/api/properties/:id/inspections", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const property = await storage.getProperty(id);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      const inspections = await storage.getInspectionsByProperty(id);
      
      // Enhance with template names and inspector info
      const enhancedInspections = await Promise.all(inspections.map(async (inspection: any) => {
        let templateName = 'Unknown Template';
        if (inspection.templateId) {
          const template = await storage.getInspectionTemplate(inspection.templateId);
          if (template) templateName = template.name;
        }

        let inspectorName = undefined;
        if (inspection.inspectorId) {
          const inspector = await storage.getUser(inspection.inspectorId);
          if (inspector) inspectorName = `${inspector.firstName} ${inspector.lastName}`;
        }

        return {
          id: inspection.id,
          templateName,
          scheduledDate: inspection.scheduledDate,
          status: inspection.status,
          inspectorName,
        };
      }));

      res.json(enhancedInspections);
    } catch (error) {
      console.error("Error fetching property inspections:", error);
      res.status(500).json({ message: "Failed to fetch inspections" });
    }
  });

  // Get property inventory
  app.get("/api/properties/:id/inventory", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const property = await storage.getProperty(id);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      const inventory = await storage.getAssetInventoryByProperty(id);
      
      // Enhance with formatted data for BTR managers
      const enhancedInventory = inventory.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category || 'General',
        condition: item.condition,
        quantity: 1, // Default quantity
        datePurchased: item.datePurchased,
        expectedLifespanYears: item.expectedLifespanYears,
        photoUrl: item.photos?.[0] || null, // Use first photo from photos array
      }));

      res.json(enhancedInventory);
    } catch (error) {
      console.error("Error fetching property inventory:", error);
      res.status(500).json({ message: "Failed to fetch inventory" });
    }
  });

  // Get property compliance documents
  app.get("/api/properties/:id/compliance", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const property = await storage.getProperty(id);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      const allComplianceDocs = await storage.getComplianceDocuments(user.organizationId);
      const complianceDocs = allComplianceDocs.filter((d: any) => d.propertyId === id);
      
      // Add status based on expiry and enhance with names
      const now = new Date();
      const enhancedDocs = complianceDocs.map((doc: any) => {
        let status = 'valid';
        if (doc.expiryDate) {
          const expiryDate = new Date(doc.expiryDate);
          const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilExpiry < 0) {
            status = 'expired';
          } else if (daysUntilExpiry <= 30) {
            status = 'expiring';
          } else {
            status = 'valid';
          }
        }
        
        return {
          id: doc.id,
          documentName: doc.documentType, // Use documentType as name
          documentType: doc.documentType,
          documentUrl: doc.documentUrl,
          expiryDate: doc.expiryDate,
          status,
          uploadedAt: doc.createdAt,
        };
      });

      res.json(enhancedDocs);
    } catch (error) {
      console.error("Error fetching property compliance:", error);
      res.status(500).json({ message: "Failed to fetch compliance documents" });
    }
  });

  // Get property annual compliance report
  app.get("/api/properties/:id/compliance-report", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const property = await storage.getProperty(id);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      // Get all inspections for this property
      const allInspections = await storage.getInspectionsByProperty(id);
      
      // Get all inspection templates
      const templates = await storage.getInspectionTemplatesByOrganization(user.organizationId);
      const activeTemplates = templates.filter(t => t.isActive && (t.scope === 'property' || t.scope === 'both'));
      
      // Build compliance data by template and month
      const currentYear = new Date().getFullYear();
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      const complianceData = activeTemplates.map(template => {
        const templateInspections = allInspections.filter(i => i.templateId === template.id);
        
        const monthData = months.map((monthName, monthIndex) => {
          // Find inspections scheduled for this month
          const monthInspections = templateInspections.filter(inspection => {
            if (!inspection.scheduledDate) return false;
            const schedDate = new Date(inspection.scheduledDate);
            return schedDate.getFullYear() === currentYear && schedDate.getMonth() === monthIndex;
          });
          
          if (monthInspections.length === 0) {
            return { month: monthName, status: 'not_scheduled', count: 0 };
          }
          
          const now = new Date();
          const completedCount = monthInspections.filter(i => i.status === 'completed').length;
          const overdueCount = monthInspections.filter(i => {
            if (i.status === 'completed' || !i.scheduledDate) return false;
            const schedDate = new Date(i.scheduledDate);
            return schedDate < now;
          }).length;
          
          const dueCount = monthInspections.filter(i => {
            if (i.status === 'completed' || !i.scheduledDate) return false;
            const schedDate = new Date(i.scheduledDate);
            const daysUntil = Math.ceil((schedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return daysUntil >= 0 && daysUntil <= 30;
          }).length;
          
          let status = 'not_scheduled';
          if (overdueCount > 0) {
            status = 'overdue';
          } else if (completedCount === monthInspections.length) {
            status = 'completed';
          } else if (dueCount > 0) {
            status = 'due';
          } else {
            status = 'scheduled';
          }
          
          return {
            month: monthName,
            status,
            count: monthInspections.length,
            completed: completedCount,
            overdue: overdueCount,
          };
        });
        
        // Calculate compliance percentage for this template
        const totalScheduled = monthData.reduce((sum, m) => sum + m.count, 0);
        const totalCompleted = monthData.reduce((sum, m) => sum + (m.completed || 0), 0);
        const complianceRate = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
        
        return {
          templateId: template.id,
          templateName: template.name,
          monthData,
          complianceRate,
          totalScheduled,
          totalCompleted,
        };
      });
      
      // Calculate overall compliance
      const totalScheduled = complianceData.reduce((sum, t) => sum + t.totalScheduled, 0);
      const totalCompleted = complianceData.reduce((sum, t) => sum + t.totalCompleted, 0);
      const overallCompliance = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 100;
      
      res.json({
        year: currentYear,
        months,
        templates: complianceData,
        overallCompliance,
        totalScheduled,
        totalCompleted,
      });
    } catch (error) {
      console.error("Error fetching property compliance report:", error);
      res.status(500).json({ message: "Failed to fetch compliance report" });
    }
  });

  // Get property maintenance requests
  app.get("/api/properties/:id/maintenance", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const property = await storage.getProperty(id);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      const maintenance = await storage.getMaintenanceRequestsByProperty(id);
      
      // Enhance with user info
      const enhancedMaintenance = await Promise.all(maintenance.map(async (request: any) => {
        let reportedByName = 'Unknown';
        if (request.reportedBy) {
          const reporter = await storage.getUser(request.reportedBy);
          if (reporter) reportedByName = `${reporter.firstName} ${reporter.lastName}`;
        }

        let assignedToName = undefined;
        if (request.assignedTo) {
          const assignee = await storage.getUser(request.assignedTo);
          if (assignee) assignedToName = `${assignee.firstName} ${assignee.lastName}`;
        }

        return {
          id: request.id,
          title: request.title,
          description: request.description,
          priority: request.priority,
          status: request.status,
          category: request.source || 'general', // Use source as category for now
          createdAt: request.createdAt,
          reportedByName,
          assignedToName,
          photoUrl: request.photoUrl,
        };
      }));

      res.json(enhancedMaintenance);
    } catch (error) {
      console.error("Error fetching property maintenance:", error);
      res.status(500).json({ message: "Failed to fetch maintenance requests" });
    }
  });

  // ==================== USER ROUTES ====================
  
  app.get("/api/users/clerks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.json([]);
      }

      const users = await storage.getUsersByOrganizationAndRole(user.organizationId, "clerk");
      // Filter to only return active clerks
      const activeClerks = users.filter(u => u.isActive !== false);
      res.json(activeClerks);
    } catch (error) {
      console.error("Error fetching clerks:", error);
      res.status(500).json({ message: "Failed to fetch clerks" });
    }
  });

  app.get("/api/users/role/tenant", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.json([]);
      }

      const users = await storage.getUsersByOrganizationAndRole(user.organizationId, "tenant");
      // Filter to only return active tenants
      const activeTenants = users.filter(u => u.isActive !== false);
      res.json(activeTenants);
    } catch (error) {
      console.error("Error fetching tenants:", error);
      res.status(500).json({ message: "Failed to fetch tenants" });
    }
  });

  // ==================== PROPERTY BY BLOCK ROUTES ====================
  
  // Get properties by block
  app.get("/api/blocks/:blockId/properties", isAuthenticated, async (req, res) => {
    try {
      const { blockId } = req.params;
      const properties = await storage.getPropertiesByBlock(blockId);
      res.json(properties);
    } catch (error) {
      console.error("Error fetching properties for block:", error);
      res.status(500).json({ message: "Failed to fetch properties" });
    }
  });

  // ==================== INSPECTION ROUTES ====================
  
  app.post("/api/inspections", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const currentUser = await storage.getUser(userId);
      const { propertyId, blockId, type, scheduledDate, notes, clerkId, templateId } = req.body;
      
      // Must specify either propertyId OR blockId (not both)
      if ((!propertyId && !blockId) || (propertyId && blockId)) {
        return res.status(400).json({ message: "Must specify either propertyId OR blockId (not both)" });
      }
      
      if (!type) {
        return res.status(400).json({ message: "Inspection type is required" });
      }

      if (!currentUser?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Use provided clerkId if available, otherwise assign to current user
      let inspectorId = userId;
      
      if (clerkId) {
        // Validate that the clerk belongs to the same organization
        const clerk = await storage.getUser(clerkId);
        if (!clerk || clerk.organizationId !== currentUser.organizationId) {
          return res.status(400).json({ message: "Invalid clerk assignment - clerk must belong to your organization" });
        }
        inspectorId = clerkId;
      }

      // Handle template snapshot creation
      let templateSnapshotJson = null;
      let templateVersion = null;
      let finalTemplateId = templateId;
      
      if (!finalTemplateId) {
        const orgTemplates = await storage.getInspectionTemplatesByOrganization(currentUser.organizationId);
        
        if (type === 'check_in') {
          const checkInTemplate = orgTemplates.find(t => 
            t.name.toLowerCase().includes('check in') && t.isActive
          );
          if (checkInTemplate) {
            finalTemplateId = checkInTemplate.id;
            console.log(`Auto-selected Check In template: ${checkInTemplate.id}`);
          }
        } else if (type === 'check_out') {
          const checkOutTemplate = orgTemplates.find(t => 
            t.name.toLowerCase().includes('check out') && t.isActive
          );
          if (checkOutTemplate) {
            finalTemplateId = checkOutTemplate.id;
            console.log(`Auto-selected Check Out template: ${checkOutTemplate.id}`);
          }
        }
      }
      
      if (finalTemplateId) {
        const template = await storage.getInspectionTemplate(finalTemplateId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }
        
        if (template.organizationId !== currentUser.organizationId) {
          return res.status(403).json({ message: "Template does not belong to your organization" });
        }
        
        const isPropertyInspection = !!propertyId;
        const isBlockInspection = !!blockId;
        
        if (isPropertyInspection && template.scope === 'block') {
          return res.status(400).json({ message: "Cannot use block-scoped template for property inspection" });
        }
        if (isBlockInspection && template.scope === 'property') {
          return res.status(400).json({ message: "Cannot use property-scoped template for block inspection" });
        }
        
        templateSnapshotJson = template.structureJson;
        templateVersion = template.version;
      }

      const inspection = await storage.createInspection({
        organizationId: currentUser.organizationId,
        propertyId: propertyId || null,
        blockId: blockId || null,
        inspectorId,
        type,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(),
        notes,
        templateId: finalTemplateId || null,
        templateVersion,
        templateSnapshotJson: templateSnapshotJson as any,
      });

      res.json(inspection);
    } catch (error) {
      console.error("Error creating inspection:", error);
      console.error("Request body:", req.body);
      console.error("Error details:", error instanceof Error ? error.message : String(error));
      res.status(500).json({ 
        message: "Failed to create inspection",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/inspections/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.json([]);
      }

      // Owners see all inspections in their organization
      // Clerks see only inspections assigned to them
      let inspections;
      if (user.role === "owner" || user.role === "compliance") {
        inspections = await storage.getInspectionsByOrganization(user.organizationId);
      } else {
        inspections = await storage.getInspectionsByInspector(userId);
      }
      
      res.json(inspections);
    } catch (error) {
      console.error("Error fetching inspections:", error);
      res.status(500).json({ message: "Failed to fetch inspections" });
    }
  });

  app.get("/api/inspections/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Set cache-control headers to prevent caching
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const inspection = await storage.getInspection(id);
      
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Verify access: Clerks can only view inspections assigned to them
      if (user.role !== "owner" && user.role !== "compliance") {
        if (inspection.inspectorId !== userId) {
          return res.status(403).json({ message: "Access denied: Inspection not assigned to you" });
        }
      }

      // Verify organization ownership
      if (inspection.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied: Inspection does not belong to your organization" });
      }

      // Fetch inspection items
      const items = await storage.getInspectionItems(id);
      console.log(`[GET /api/inspections/:id] Fetched ${items.length} items for inspection ${id}`);

      // Fetch related data
      let property = null;
      let block = null;
      let clerk = null;

      if (inspection.propertyId) {
        property = await storage.getProperty(inspection.propertyId);
      }
      if (inspection.blockId) {
        block = await storage.getBlock(inspection.blockId);
      }
      if (inspection.inspectorId) {
        clerk = await storage.getUser(inspection.inspectorId);
      }

      const response = {
        ...inspection,
        items,
        property,
        block,
        clerk,
      };
      
      console.log(`[GET /api/inspections/:id] Returning inspection with ${response.items.length} items`);
      res.json(response);
    } catch (error) {
      console.error("Error fetching inspection:", error);
      res.status(500).json({ message: "Failed to fetch inspection" });
    }
  });

  // Generate PDF report for inspection
  app.get("/api/inspections/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "No organization found" });
      }

      // Get inspection
      const inspection = await storage.getInspection(id);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Verify organization ownership
      if (inspection.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Fetch property and inspector data
      let property = null;
      let inspector = null;

      if (inspection.propertyId) {
        property = await storage.getProperty(inspection.propertyId);
      }

      if (inspection.inspectorId) {
        inspector = await storage.getUser(inspection.inspectorId);
      }

      // Fetch organization branding for white-label PDF
      const organization = await storage.getOrganization(user.organizationId);
      const branding = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingAddress: organization.brandingAddress,
        brandingWebsite: organization.brandingWebsite,
      } : undefined;

      // Build full inspection object with relations
      const fullInspection = {
        ...inspection,
        property: property || undefined,
        inspector: inspector || undefined,
      };

      // Get inspection entries
      const entries = await storage.getInspectionEntries(id);

      // Build base URL for converting relative image paths to absolute
      const protocol = req.protocol;
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;

      // Generate PDF with branding
      const pdfBuffer = await generateInspectionPDF(fullInspection as any, entries, baseUrl, branding);

      // Set headers for PDF download
      const propertyName = property?.name || "inspection";
      const filename = `${propertyName.replace(/[^a-zA-Z0-9]/g, "_")}_inspection_report.pdf`;
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // General PATCH endpoint for updating inspection fields
  app.patch("/api/inspections/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "No organization found" });
      }

      // Get inspection and verify ownership
      const inspection = await storage.getInspection(id);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Verify organization ownership via property or block
      let ownerOrgId: string | null = null;
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }
        ownerOrgId = property.organizationId;
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block) {
          return res.status(404).json({ message: "Block not found" });
        }
        ownerOrgId = block.organizationId;
      }

      if (ownerOrgId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Verify access: Clerks can only update inspections assigned to them
      if (user.role !== "owner" && user.role !== "compliance") {
        if (inspection.inspectorId !== user.id) {
          return res.status(403).json({ message: "Access denied: Inspection not assigned to you" });
        }
      }

      // Validate and update inspection
      const validation = updateInspectionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      // Convert date strings to Date objects for storage
      const updates: any = { ...validation.data };
      if (updates.scheduledDate && typeof updates.scheduledDate === 'string') {
        updates.scheduledDate = new Date(updates.scheduledDate);
      }
      if (updates.startedAt && typeof updates.startedAt === 'string') {
        updates.startedAt = new Date(updates.startedAt);
      }
      if (updates.completedDate && typeof updates.completedDate === 'string') {
        updates.completedDate = new Date(updates.completedDate);
      }
      if (updates.submittedAt && typeof updates.submittedAt === 'string') {
        updates.submittedAt = new Date(updates.submittedAt);
      }

      // NOTE: Credit consumption removed from manual status changes
      // Credits are only consumed during actual inspection submission workflow
      // This allows flexible status management without credit restrictions

      const updatedInspection = await storage.updateInspection(id, updates);
      
      // Send email if status changed to completed
      if (validation.data.status === "completed" && inspection.status !== "completed") {
        try {
          const inspector = await storage.getUser(inspection.inspectorId);
          const inspectorName = inspector ? `${inspector.firstName || ''} ${inspector.lastName || ''}`.trim() || inspector.username : 'Unknown Inspector';
          
          let propertyName: string | undefined;
          let blockName: string | undefined;
          
          if (inspection.propertyId) {
            const property = await storage.getProperty(inspection.propertyId);
            propertyName = property?.name;
          } else if (inspection.blockId) {
            const block = await storage.getBlock(inspection.blockId);
            blockName = block?.name;
          }

          if (ownerOrgId) {
            const owners = await storage.getUsersByOrganization(ownerOrgId);
            const owner = owners.find(u => u.role === 'owner');
            
            if (owner && owner.email) {
              await sendInspectionCompleteEmail(
                owner.email,
                `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email,
                {
                  type: inspection.type,
                  propertyName,
                  blockName,
                  inspectorName,
                  completedDate: updatedInspection.completedDate || new Date(),
                  inspectionId: inspection.id
                }
              );
            }
          }
        } catch (emailError) {
          console.error('Failed to send inspection complete email:', emailError);
        }
      }

      res.json(updatedInspection);
    } catch (error) {
      console.error("Error updating inspection:", error);
      res.status(500).json({ message: "Failed to update inspection" });
    }
  });

  app.patch("/api/inspections/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      // Get inspection details before updating
      const inspection = await storage.getInspection(id);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }
      
      // NOTE: Credit consumption removed from manual status changes
      // Credits are only consumed during actual inspection submission workflow
      // This allows flexible status management without credit restrictions

      // Update status
      const updatedInspection = await storage.updateInspectionStatus(
        id,
        status,
        status === "completed" ? new Date() : undefined
      );

      // Send email notification to owner when inspection is completed
      if (status === "completed") {
        try {
          // Get inspector details
          const inspector = await storage.getUser(inspection.inspectorId);
          const inspectorName = inspector ? `${inspector.firstName || ''} ${inspector.lastName || ''}`.trim() || inspector.username : 'Unknown Inspector';
          
          // Get property or block name
          let propertyName: string | undefined;
          let blockName: string | undefined;
          let organizationId: string | undefined;
          
          if (inspection.propertyId) {
            const property = await storage.getProperty(inspection.propertyId);
            propertyName = property?.name;
            organizationId = property?.organizationId;
          } else if (inspection.blockId) {
            const block = await storage.getBlock(inspection.blockId);
            blockName = block?.name;
            organizationId = block?.organizationId;
          }

          // Get organization owner's email
          if (organizationId) {
            const owners = await storage.getUsersByOrganization(organizationId);
            const owner = owners.find(u => u.role === 'owner');
            
            if (owner && owner.email) {
              await sendInspectionCompleteEmail(
                owner.email, // Email address
                `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email,
                {
                  type: inspection.type,
                  propertyName,
                  blockName,
                  inspectorName,
                  completedDate: updatedInspection.completedDate || new Date(),
                  inspectionId: inspection.id
                }
              );
              console.log(`Inspection complete email sent to owner: ${owner.email}`);
            } else {
              console.warn('No owner found for organization or owner has no email:', organizationId);
            }
          }
        } catch (emailError) {
          // Log email error but don't fail the request
          console.error('Failed to send inspection complete email:', emailError);
        }
      }

      res.json(updatedInspection);
    } catch (error) {
      console.error("Error updating inspection status:", error);
      res.status(500).json({ message: "Failed to update inspection status" });
    }
  });

  // ==================== INSPECTION RESPONSE ROUTES ====================

  // Create or update inspection response
  app.post("/api/inspections/:inspectionId/responses", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify inspection exists
      const inspection = await storage.getInspection(req.params.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      // Verify inspection belongs to user's organization via property or block
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Prevent inspectionId override from request body
      const { inspectionId: _, ...safeBody } = req.body;
      const response = await storage.createInspectionResponse({
        ...safeBody,
        inspectionId: req.params.inspectionId,
      });

      res.json(response);
    } catch (error) {
      console.error("Error creating inspection response:", error);
      res.status(500).json({ error: "Failed to create inspection response" });
    }
  });

  // Get all responses for an inspection
  app.get("/api/inspections/:inspectionId/responses", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify inspection exists
      const inspection = await storage.getInspection(req.params.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      // Verify inspection belongs to user's organization via property or block
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const responses = await storage.getInspectionResponses(req.params.inspectionId);
      res.json(responses);
    } catch (error) {
      console.error("Error fetching inspection responses:", error);
      res.status(500).json({ error: "Failed to fetch inspection responses" });
    }
  });

  // Update inspection response
  app.patch("/api/inspection-responses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Get the response to find its inspection
      const existingResponse = await storage.getInspectionResponse(req.params.id);
      if (!existingResponse) {
        return res.status(404).json({ error: "Response not found" });
      }

      // Verify the inspection belongs to user's organization
      const inspection = await storage.getInspection(existingResponse.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Prevent inspectionId changes in updates
      const { inspectionId: _, ...safeUpdates } = req.body;
      const updated = await storage.updateInspectionResponse(req.params.id, safeUpdates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating inspection response:", error);
      res.status(500).json({ error: "Failed to update inspection response" });
    }
  });

  // Delete inspection response
  app.delete("/api/inspection-responses/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Get the response to find its inspection
      const existingResponse = await storage.getInspectionResponse(req.params.id);
      if (!existingResponse) {
        return res.status(404).json({ error: "Response not found" });
      }

      // Verify the inspection belongs to user's organization
      const inspection = await storage.getInspection(existingResponse.inspectionId);
      if (!inspection) {
        return res.status(404).json({ error: "Inspection not found" });
      }

      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property || property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block || block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      await storage.deleteInspectionResponse(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting inspection response:", error);
      res.status(500).json({ error: "Failed to delete inspection response" });
    }
  });

  // ==================== INSPECTION ITEM ROUTES ====================
  
  app.post("/api/inspection-items", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { inspectionId, category, itemName, photoUrl, conditionRating, notes } = req.body;
      
      if (!inspectionId || !category || !itemName) {
        return res.status(400).json({ message: "Inspection ID, category, and item name are required" });
      }

      const item = await storage.createInspectionItem({
        inspectionId,
        category,
        itemName,
        photoUrl: photoUrl || null,
        conditionRating: conditionRating || null,
        notes: notes || null,
      });

      console.log(`[POST /api/inspection-items] Created item:`, {
        id: item.id,
        inspectionId: item.inspectionId,
        category: item.category,
        itemName: item.itemName,
      });

      res.json(item);
    } catch (error) {
      console.error("Error creating inspection item:", error);
      res.status(500).json({ message: "Failed to create inspection item" });
    }
  });

  // ==================== AI ANALYSIS ROUTES ====================
  
  app.post("/api/ai/analyze-photo", isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body
      const validation = analyzePhotoSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { itemId } = validation.data;

      // Get the inspection item
      const item = await storage.getInspectionItem(itemId);
      
      if (!item || !item.photoUrl) {
        return res.status(400).json({ message: "Inspection item not found or has no photo" });
      }

      // Get user and verify organization membership
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Verify the inspection item belongs to the user's organization
      const inspection = await storage.getInspection(item.inspectionId);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Check ownership via property OR block
      let ownerOrgId: string | null = null;
      
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }
        ownerOrgId = property.organizationId;
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block) {
          return res.status(404).json({ message: "Block not found" });
        }
        ownerOrgId = block.organizationId;
      } else {
        return res.status(400).json({ message: "Inspection has no property or block assigned" });
      }

      // Verify organization ownership
      if (ownerOrgId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied: Inspection item does not belong to your organization" });
      }

      // Check credits AFTER verifying ownership
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization || (organization.creditsRemaining ?? 0) < 1) {
        return res.status(402).json({ message: "Insufficient credits" });
      }

      // Convert photo to base64 data URL
      console.log("[Inspection Item Analysis] Converting photo to base64:", item.photoUrl);
      
      let photoUrl: string;
      if (item.photoUrl.startsWith("http")) {
        // External URL - use directly
        photoUrl = item.photoUrl;
      } else {
        // Internal object storage - convert to base64
        try {
          const objectStorageService = new ObjectStorageService();
          // Ensure path starts with /objects/
          const photoPath = item.photoUrl.startsWith('/objects/') ? item.photoUrl : `/objects/${item.photoUrl}`;
          const objectFile = await objectStorageService.getObjectEntityFile(photoPath);
          
          // Read the file contents using fs.readFile first
          const photoBuffer = await fs.readFile(objectFile.name);
          
          // Always detect MIME type from buffer for reliability
          let mimeType = detectImageMimeType(photoBuffer);
          
          // Get metadata for logging purposes
          const [metadata] = await objectFile.getMetadata();
          const metadataContentType = metadata.contentType;
          
          console.log(`[Inspection Item Analysis] MIME type detection:`, {
            detected: mimeType,
            fromMetadata: metadataContentType,
            bufferSize: photoBuffer.length,
          });
          
          // Ensure we have a valid image MIME type
          if (!mimeType || !mimeType.startsWith('image/')) {
            console.warn(`[Inspection Item Analysis] Invalid MIME type detected: ${mimeType}, defaulting to image/jpeg`);
            mimeType = 'image/jpeg';
          }
          
          // Convert to base64 data URL
          const base64Image = photoBuffer.toString('base64');
          photoUrl = `data:${mimeType};base64,${base64Image}`;
          
          console.log("[Inspection Item Analysis] Converted to base64 data URL:", photoPath, `(${mimeType})`);
        } catch (error: any) {
          // Safely log error without circular reference issues
          const errorMessage = error?.message || String(error);
          console.error("[Inspection Item Analysis] Error converting photo to base64:", {
            photoUrl: item.photoUrl,
            message: errorMessage,
            errorType: error?.constructor?.name,
          });
          if (error instanceof ObjectNotFoundError) {
            throw new Error(`Photo not found: ${item.photoUrl}. The file may have been deleted or moved.`);
          }
          throw new Error(`Failed to load photo for analysis: ${item.photoUrl}. ${errorMessage}`);
        }
      }

      // Call OpenAI Vision API using Responses API
      const response = await getOpenAI().responses.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        input: [
          {
            role: "user",
            content: normalizeApiContent([
              {
                type: "text",
                text: `Analyze this ${item.category} - ${item.itemName} photo from a property inspection. Provide a detailed condition assessment including any damage, wear, cleanliness issues, or notable features. Be specific and objective.`
              },
              {
                type: "image_url",
                image_url: photoUrl
              }
            ])
          }
        ],
        max_output_tokens: 300,
      });

      let analysis = response.output_text || (response.output?.[0] as any)?.content?.[0]?.text || "Unable to analyze image";
      
      // Strip markdown asterisks from the response
      analysis = analysis.replace(/\*\*/g, '');

      // Update the item with AI analysis
      await storage.updateInspectionItemAI(itemId, analysis);

      // Deduct credit
      await storage.updateOrganizationCredits(
        organization.id,
        (organization.creditsRemaining ?? 0) - 1
      );

      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: -1,
        type: "inspection",
        description: `AI photo analysis: ${item.category} - ${item.itemName}`,
      });

      res.json({ analysis });
    } catch (error: any) {
      // Safely log error without circular reference issues
      const errorMessage = error?.message || String(error);
      console.error("Error analyzing photo:", {
        message: errorMessage,
        status: error?.status,
        code: error?.code,
      });
      res.status(500).json({ message: "Failed to analyze photo" });
    }
  });

  // AI field-level inspection analysis
  app.post("/api/ai/inspect-field", isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body
      const validation = inspectFieldSchema.safeParse(req.body);
      if (!validation.success) {
        console.error("[InspectAI] Validation failed:", validation.error.errors);
        console.error("[InspectAI] Request body:", req.body);
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { inspectionId, fieldKey, fieldLabel, fieldDescription, photos } = validation.data;

      // Get user and verify organization membership
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Verify the inspection belongs to the user's organization
      const inspection = await storage.getInspection(inspectionId);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Check ownership via property OR block
      let ownerOrgId: string | null = null;
      
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }
        ownerOrgId = property.organizationId;
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block) {
          return res.status(404).json({ message: "Block not found" });
        }
        ownerOrgId = block.organizationId;
      } else {
        return res.status(400).json({ message: "Inspection has no property or block assigned" });
      }

      // Verify organization ownership
      if (ownerOrgId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied: Inspection does not belong to your organization" });
      }

      // Check credits (1 credit per field inspection)
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization || (organization.creditsRemaining ?? 0) < 1) {
        return res.status(402).json({ message: "Insufficient credits" });
      }

      // Construct image data URLs - download images and convert to base64
      const objectStorageService = new ObjectStorageService();
      const photoUrls = await Promise.all(photos.map(async (photo) => {
        // If already a full HTTP URL, use it directly
        if (photo.startsWith("http")) {
          return photo;
        }
        
        // If it's an /objects/ path, download the image and convert to base64 data URL
        try {
          // Ensure path starts with /objects/
          const photoPath = photo.startsWith('/objects/') ? photo : `/objects/${photo}`;
          const objectFile = await objectStorageService.getObjectEntityFile(photoPath);
          
          // Read the file contents using fs.readFile first
          const fileBuffer = await fs.readFile(objectFile.name);
          
          // Always detect MIME type from buffer for reliability
          let contentType = detectImageMimeType(fileBuffer);
          
          // Get metadata for logging purposes
          const [metadata] = await objectFile.getMetadata();
          const metadataContentType = metadata.contentType;
          
          console.log(`[InspectAI] MIME type detection:`, {
            detected: contentType,
            fromMetadata: metadataContentType,
            bufferSize: fileBuffer.length,
          });
          
          // Ensure we have a valid image MIME type
          if (!contentType || !contentType.startsWith('image/')) {
            console.warn(`[InspectAI] Invalid MIME type detected: ${contentType}, defaulting to image/jpeg`);
            contentType = 'image/jpeg';
          }
          
          // Convert to base64 data URL
          const base64Data = fileBuffer.toString('base64');
          const dataUrl = `data:${contentType};base64,${base64Data}`;
          
          console.log(`[InspectAI] Converted photo to base64 data URL: ${photoPath} (${contentType}, ${base64Data.length} bytes)`);
          return dataUrl;
        } catch (error: any) {
          // Safely log error without circular reference issues
          const errorMessage = error?.message || String(error);
          console.error("[InspectAI] Error converting photo to base64:", {
            photo,
            message: errorMessage,
            errorType: error?.constructor?.name,
          });
          if (error instanceof ObjectNotFoundError) {
            throw new Error(`Photo not found: ${photo}. The file may have been deleted or moved.`);
          }
          throw new Error(`Failed to load photo for analysis: ${photo}. ${errorMessage}`);
        }
      }));

      // Get template settings for AI configuration with proper inheritance:
      // Template settings > Organization defaults > System defaults
      let aiMaxWords: number;
      let aiInstruction: string;
      
      // Get template settings if available
      let templateAiMaxWords: number | null = null;
      let templateAiInstruction: string | null = null;
      
      if (inspection.templateId) {
        const template = await storage.getInspectionTemplate(inspection.templateId);
        if (template) {
          templateAiMaxWords = template.aiMaxWords;
          templateAiInstruction = template.aiInstruction || null;
        }
      }

      // Apply inheritance chain independently for each field:
      // aiMaxWords: template > organization > system default (150)
      aiMaxWords = templateAiMaxWords ?? organization.defaultAiMaxWords ?? 150;
      
      // aiInstruction: template > organization > empty (use default prompt)
      aiInstruction = templateAiInstruction ?? organization.defaultAiInstruction ?? "";

      // Build the prompt with field context - using custom instruction if provided
      let promptText: string;
      
      if (aiInstruction) {
        // Use custom AI instruction from template or organization
        promptText = `${aiInstruction}

Focus SPECIFICALLY on: "${fieldLabel}"`;
        if (fieldDescription) {
          promptText += `\nContext: ${fieldDescription}`;
        }
        promptText += `\n\nI have ${photoUrls.length} image(s) to analyze. Provide your assessment for "${fieldLabel}".

IMPORTANT FORMATTING RULES:
- Keep your response under ${aiMaxWords} words
- Write in plain text only - do NOT use asterisks (*), hash symbols (#), bullet points, or numbered lists
- Do NOT use any markdown formatting
- Do NOT include emojis
- Write in professional, flowing paragraphs`;
      } else {
        // Default prompt
        promptText = `You are analyzing a property inspection photo. Focus SPECIFICALLY on: "${fieldLabel}"`;
        if (fieldDescription) {
          promptText += `\nContext: ${fieldDescription}`;
        }
        promptText += `\n\nIMPORTANT: The photo may show an entire room or area, but you must focus your analysis ONLY on "${fieldLabel}". Ignore other elements in the photo that are not directly related to this inspection point.

I have ${photoUrls.length} image(s). Provide a concise inspection report for "${fieldLabel}" covering:
- Overall condition assessment
- Any visible damage, defects, or wear
- Cleanliness and maintenance issues
- Notable features or observations
- Recommendations (if any)

IMPORTANT FORMATTING RULES:
- Keep your response under ${aiMaxWords} words
- Write in plain text only - do NOT use asterisks (*), hash symbols (#), bullet points, or numbered lists
- Do NOT use any markdown formatting
- Do NOT include emojis
- Write in professional, flowing paragraphs

Be thorough but concise, specific, and objective about the ${fieldLabel}. Do not comment on items outside the scope of "${fieldLabel}". This will be used in a professional property inspection report.`;
      }

      // Build content array with text and all images
      const content: any[] = [
        {
          type: "text",
          text: promptText
        }
      ];

      // Add all photos - use string format directly for normalizeApiContent
      photoUrls.forEach((url, index) => {
        content.push({
          type: "image_url",
          image_url: url // Pass as string, normalizeApiContent will handle it
        });
      });

      console.log("[InspectAI] Sending to OpenAI - Photo URLs:", photoUrls.length, "photos");
      console.log("[InspectAI] Content structure:", JSON.stringify(content.map(c => ({ type: c.type, hasUrl: !!c.image_url })), null, 2));

      // Call OpenAI Vision API using Responses API
      // Set max_output_tokens to 10000 to allow for very detailed analysis
      const response = await getOpenAI().responses.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        input: [
          {
            role: "user",
            content: normalizeApiContent(content)
          }
        ],
        max_output_tokens: 10000, // Increased to 10000 to allow very detailed responses
      });

      // Check if response is incomplete due to token limit
      if (response.status === "incomplete") {
        const reason = response.incomplete_details?.reason;
        console.error("[InspectAI] Response is incomplete:", {
          reason,
          maxOutputTokens: response.max_output_tokens,
          outputTokens: response.usage?.output_tokens,
          reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens,
        });
        
        if (reason === "max_output_tokens") {
          // Return user-friendly message instead of throwing error
          return res.status(200).json({ 
            analysis: "Token limit exceeded. Please try again later.",
            tokenExceeded: true 
          });
        } else {
          throw new Error(`The analysis response is incomplete: ${reason || "unknown reason"}. Please try again.`);
        }
      }

      const outputItem = response.output?.[0] as any;
      console.log("[InspectAI] OpenAI Response structure:", {
        status: response.status,
        hasOutputText: !!response.output_text,
        outputTextLength: response.output_text?.length || 0,
        hasOutput: !!response.output,
        outputLength: response.output?.length || 0,
        outputFirstItem: outputItem ? {
          type: outputItem.type,
          hasContent: !!outputItem.content,
          contentLength: outputItem.content?.length || 0,
          firstContentType: outputItem.content?.[0]?.type,
          firstContentText: outputItem.content?.[0]?.text?.substring(0, 100) || 'N/A'
        } : null,
      });

      // Try multiple ways to extract the analysis text
      let analysis = "";
      
      // Method 1: Direct output_text (most common)
      if (response.output_text && response.output_text.trim().length > 0) {
        analysis = response.output_text;
        console.log("[InspectAI] Using output_text");
      }
      // Method 2: output[0].content[0].text
      else if (outputItem?.content?.[0]?.text) {
        analysis = outputItem.content[0].text;
        console.log("[InspectAI] Using output[0].content[0].text");
      }
      // Method 3: Check for text type in output array
      else if (response.output) {
        // Look for any output item with text content
        for (const item of response.output) {
          const typedItem = item as any;
          if (typedItem.type === "text" && typedItem.text) {
            analysis = typedItem.text;
            console.log("[InspectAI] Using output item with type 'text'");
            break;
          }
          if (typedItem.content) {
            for (const contentItem of typedItem.content) {
              if (contentItem.type === "text" && contentItem.text) {
                analysis = contentItem.text;
                console.log("[InspectAI] Using content item with type 'text'");
                break;
              }
            }
            if (analysis) break;
          }
        }
      }
      // Method 4: Check response directly
      else if (typeof response === 'string') {
        analysis = response;
        console.log("[InspectAI] Response is a string");
      }
      
      // Validate we got analysis text
      if (!analysis || analysis.trim().length === 0) {
        console.error("[InspectAI] Analysis text is empty. Response:", JSON.stringify(response, null, 2));
        throw new Error("OpenAI API returned an empty analysis. The response may have been incomplete. Please try again.");
      }
      
      // Strip forbidden characters from the response:
      // - Remove all asterisks (*, **)
      // - Remove all hash symbols (#)
      // - Remove emojis
      analysis = analysis
        .replace(/\*+/g, '') // Remove asterisks
        .replace(/#+/g, '') // Remove hash symbols
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '') // Remove emojis using Unicode property escapes
        .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
        .trim();

      // Deduct credit
      await storage.updateOrganizationCredits(
        organization.id,
        (organization.creditsRemaining ?? 0) - 1
      );

      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: -1,
        type: "inspection",
        description: `InspectAI field analysis: ${fieldLabel}`,
      });

      res.json({ analysis });
    } catch (error: any) {
      // Safely log error without circular reference issues
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack;
      console.error("Error analyzing field:", {
        message: errorMessage,
        stack: errorStack?.substring(0, 500), // Limit stack trace length
        status: error?.status,
        code: error?.code,
        type: error?.type,
        param: error?.param,
      });
      
      // Return more specific error message
      const userMessage = errorMessage.includes("OpenAI") 
        ? "AI service returned an error. Please try again."
        : errorMessage.includes("credits")
        ? "Insufficient credits for AI analysis"
        : errorMessage.includes("unexpected response format") || errorMessage.includes("empty analysis")
        ? "AI service returned an invalid response. Please try again."
        : "Failed to analyze field. Please try again.";
      
      res.status(500).json({ message: userMessage });
    }
  });

  // Full inspection AI analysis - analyzes all fields with photos in background
  app.post("/api/ai/analyze-inspection/:inspectionId", isAuthenticated, async (req: any, res) => {
    try {
      const { inspectionId } = req.params;
      
      // Get user and verify organization membership
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Verify the inspection exists and belongs to user's organization
      const inspection = await storage.getInspection(inspectionId);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Check ownership via property OR block
      let ownerOrgId: string | null = null;
      if (inspection.propertyId) {
        const property = await storage.getProperty(inspection.propertyId);
        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }
        ownerOrgId = property.organizationId;
      } else if (inspection.blockId) {
        const block = await storage.getBlock(inspection.blockId);
        if (!block) {
          return res.status(404).json({ message: "Block not found" });
        }
        ownerOrgId = block.organizationId;
      } else {
        return res.status(400).json({ message: "Inspection has no property or block assigned" });
      }

      if (ownerOrgId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check if already processing
      if (inspection.aiAnalysisStatus === "processing") {
        return res.status(409).json({ 
          message: "AI analysis is already in progress for this inspection",
          status: "processing",
          progress: inspection.aiAnalysisProgress || 0,
          totalFields: inspection.aiAnalysisTotalFields || 0
        });
      }

      // Get all inspection entries with photos
      const entries = await storage.getInspectionEntries(inspectionId);
      const entriesWithPhotos = entries.filter((e: any) => e.photos && e.photos.length > 0);
      
      if (entriesWithPhotos.length === 0) {
        return res.status(400).json({ message: "No photos found in inspection entries to analyze" });
      }

      // Get organization for credits check
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization || (organization.creditsRemaining ?? 0) < entriesWithPhotos.length) {
        return res.status(402).json({ 
          message: `Insufficient credits. You need ${entriesWithPhotos.length} credits but have ${organization?.creditsRemaining ?? 0}` 
        });
      }

      // Update inspection status to processing
      await storage.updateInspection(inspectionId, {
        aiAnalysisStatus: "processing",
        aiAnalysisProgress: 0,
        aiAnalysisTotalFields: entriesWithPhotos.length,
        aiAnalysisError: null
      } as any);

      // Start background processing (fire and forget)
      processInspectionAIAnalysis(
        inspectionId,
        entriesWithPhotos,
        inspection,
        organization,
        user.organizationId
      ).catch((error) => {
        console.error("[FullInspectAI] Background processing failed:", error);
        // Update status to failed
        storage.updateInspection(inspectionId, {
          aiAnalysisStatus: "failed",
          aiAnalysisError: error.message || "Unknown error occurred"
        } as any).catch(console.error);
      });

      // Return immediately with job started message
      res.json({ 
        message: "AI analysis started in background. You can continue working and check back later.",
        status: "processing",
        totalFields: entriesWithPhotos.length
      });

    } catch (error: any) {
      console.error("[FullInspectAI] Error starting analysis:", error);
      res.status(500).json({ message: error.message || "Failed to start AI analysis" });
    }
  });

  // Get AI analysis status for an inspection
  app.get("/api/ai/analyze-inspection/:inspectionId/status", isAuthenticated, async (req: any, res) => {
    try {
      const { inspectionId } = req.params;
      
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const inspection = await storage.getInspection(inspectionId);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      res.json({
        status: inspection.aiAnalysisStatus || "idle",
        progress: inspection.aiAnalysisProgress || 0,
        totalFields: inspection.aiAnalysisTotalFields || 0,
        error: inspection.aiAnalysisError || null
      });
    } catch (error: any) {
      console.error("[FullInspectAI] Error getting status:", error);
      res.status(500).json({ message: "Failed to get analysis status" });
    }
  });

  // Get matching Check-In inspection for reference during Check-Out
  app.get("/api/inspections/:id/check-in-reference", isAuthenticated, async (req: any, res) => {
    try {
      const { id: checkOutInspectionId } = req.params;
      
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Get the current inspection (should be check-out)
      const currentInspection = await storage.getInspection(checkOutInspectionId);
      if (!currentInspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Verify ownership
      let ownerOrgId: string | null = null;
      if (currentInspection.propertyId) {
        const property = await storage.getProperty(currentInspection.propertyId);
        if (!property) {
          return res.status(404).json({ message: "Property not found" });
        }
        ownerOrgId = property.organizationId;
      } else if (currentInspection.blockId) {
        const block = await storage.getBlock(currentInspection.blockId);
        if (!block) {
          return res.status(404).json({ message: "Block not found" });
        }
        ownerOrgId = block.organizationId;
      }

      if (ownerOrgId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Only return check-in reference if current inspection is check-out
      if (currentInspection.type !== "check_out") {
        return res.json({ checkInInspection: null, checkInEntries: [] });
      }

      // Find the most recent completed check-in for the same property
      if (!currentInspection.propertyId) {
        return res.json({ checkInInspection: null, checkInEntries: [] });
      }

      const allInspections = await storage.getInspectionsByOrganization(user.organizationId);
      const checkInInspections = allInspections
        .filter((i: any) => 
          i.propertyId === currentInspection.propertyId && 
          i.type === "check_in" && 
          i.status === "completed"
        )
        .sort((a: any, b: any) => 
          new Date(b.completedDate || b.scheduledDate).getTime() - 
          new Date(a.completedDate || a.scheduledDate).getTime()
        );

      if (checkInInspections.length === 0) {
        return res.json({ checkInInspection: null, checkInEntries: [] });
      }

      const checkInInspection = checkInInspections[0];
      const checkInEntries = await storage.getInspectionEntries(checkInInspection.id);

      res.json({ 
        checkInInspection, 
        checkInEntries 
      });
    } catch (error) {
      console.error("Error fetching check-in reference:", error);
      res.status(500).json({ message: "Failed to fetch check-in reference" });
    }
  });

  // Auto-create comparison report for a property (finds last check-in and check-out)
  app.post("/api/comparison-reports/auto", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const { propertyId, checkOutInspectionId, fieldKey } = req.body;
      
      if (!propertyId) {
        return res.status(400).json({ message: "Property ID is required" });
      }
      
      // Store context for potential future use (e.g., auto-scrolling to the field)
      const context = { checkOutInspectionId, fieldKey };

      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Verify property ownership
      const property = await storage.getProperty(propertyId);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Not authorized to access this property" });
      }

      // Check if a comparison report already exists for this property
      const existingReports = await storage.getComparisonReportsByProperty(propertyId);
      if (existingReports && existingReports.length > 0) {
        // Return the most recent report
        const latestReport = existingReports.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];
        return res.json({ report: latestReport, created: false });
      }

      // Get all inspections for this property
      const allInspections = await storage.getInspectionsByOrganization(user.organizationId);
      const propertyInspections = allInspections.filter((i: any) => i.propertyId === propertyId);

      // Find the most recent completed check-in and check-out inspections
      const checkInInspections = propertyInspections
        .filter((i: any) => i.type === "check_in" && i.status === "completed")
        .sort((a: any, b: any) => new Date(b.completedDate || b.scheduledDate).getTime() - new Date(a.completedDate || a.scheduledDate).getTime());

      const checkOutInspections = propertyInspections
        .filter((i: any) => i.type === "check_out" && i.status === "completed")
        .sort((a: any, b: any) => new Date(b.completedDate || b.scheduledDate).getTime() - new Date(a.completedDate || a.scheduledDate).getTime());

      if (checkInInspections.length === 0) {
        return res.status(400).json({ message: "No completed check-in inspection found for this property" });
      }

      if (checkOutInspections.length === 0) {
        return res.status(400).json({ message: "No completed check-out inspection found for this property" });
      }

      const lastCheckIn = checkInInspections[0];
      const lastCheckOut = checkOutInspections[0];

      // Get tenant assigned to property (optional - may be null for vacant units)
      const tenantAssignments = await storage.getTenantAssignmentsByProperty(propertyId, user.organizationId);
      const activeTenant = tenantAssignments.find(ta => ta.isActive);

      // Check credits (2 credits for comparison report generation)
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization || (organization.creditsRemaining ?? 0) < 2) {
        return res.status(402).json({ message: "Insufficient credits (2 required for comparison report)" });
      }

      // Get inspection entries marked for review from check-out inspection
      const checkOutEntries = await storage.getInspectionEntries(lastCheckOut.id);
      const markedEntries = checkOutEntries.filter(entry => entry.markedForReview);

      if (markedEntries.length === 0) {
        return res.status(400).json({ message: "No inspection entries marked for review. Please mark items for review during check-out inspection." });
      }

      // Get all check-in entries for matching
      const checkInEntries = await storage.getInspectionEntries(lastCheckIn.id);

      console.log(`[Auto-Create Comparison] Creating report for property ${propertyId}`, {
        checkInId: lastCheckIn.id,
        checkOutId: lastCheckOut.id,
        hasTenant: !!activeTenant,
        tenantId: activeTenant?.tenantId || null
      });

      // Create comparison report (tenant may be null for vacant units)
      const report = await storage.createComparisonReport({
        organizationId: user.organizationId,
        propertyId,
        checkInInspectionId: lastCheckIn.id,
        checkOutInspectionId: lastCheckOut.id,
        tenantId: activeTenant?.tenantId || null,
        status: "draft",
        totalEstimatedCost: "0",
        aiAnalysisJson: { summary: "Processing...", items: [] },
        generatedBy: user.id,
      });

      // Process marked entries asynchronously (same logic as the regular endpoint)
      (async () => {
        try {
          let totalCost = 0;
          const itemAnalyses: any[] = [];

          for (const checkOutEntry of markedEntries) {
            const checkInEntry = checkInEntries.find(
              e => e.sectionRef === checkOutEntry.sectionRef && 
                   e.fieldKey === checkOutEntry.fieldKey
            );

            let aiComparison: any = { summary: "No images to compare" };
            let estimatedCost = 0;
            let depreciation = 0;

            if (checkOutEntry.photos && checkOutEntry.photos.length > 0) {
              try {
                const checkInPhotos = checkInEntry?.photos || [];
                const checkOutPhotos = checkOutEntry.photos || [];

                const imageContent: any[] = [];
                
                if (checkInPhotos.length > 0) {
                  imageContent.push({
                    type: "text",
                    text: "CHECK-IN PHOTOS (baseline condition):"
                  });
                  checkInPhotos.slice(0, 2).forEach((url) => {
                    imageContent.push({
                      type: "image_url",
                      image_url: { url, detail: "high" }
                    });
                  });
                }

                imageContent.push({
                  type: "text",
                  text: "CHECK-OUT PHOTOS (current condition):"
                });
                checkOutPhotos.slice(0, 2).forEach((url) => {
                  imageContent.push({
                    type: "image_url",
                    image_url: { url, detail: "high" }
                  });
                });

                const prompt = `You are a professional BTR property inspector. Compare check-in vs check-out photos and provide a DETAILED analysis.

CRITICAL: Your SUMMARY must be EXACTLY 100 words (count them). This is mandatory for legal documentation.

ANALYSIS REQUIREMENTS:
- Compare baseline (check-in) condition to current (check-out) condition
- Identify ALL damage: scratches, stains, dents, tears, discoloration, wear patterns
- Note specific locations: "top left corner", "center panel", "near door handle"
- Distinguish fair wear (gradual fading, minor scuffs) from tenant damage (burns, holes, excessive staining)
- Consider age and expected condition for this property type

RESPONSE FORMAT (use EXACTLY this structure):
SUMMARY: [Write EXACTLY 100 words. Describe: 1) Overall condition change, 2) Specific damage locations and types, 3) Whether damage exceeds fair wear, 4) Evidence supporting your assessment. Be detailed and specific.]
SEVERITY: [low/medium/high]
DAMAGE: [1-2 sentence damage summary]
COST: [number in GBP, 0 if acceptable]
ACTION: [acceptable/clean/repair/replace]
LIABILITY: [tenant/landlord/shared]`;

                imageContent.unshift({
                  type: "text",
                  text: prompt
                });

                const visionResponse = await getOpenAI().responses.create({
                  model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
                  input: [{ role: "user", content: normalizeApiContent(imageContent) }],
                  max_output_tokens: 800,
                });

                const analysis = visionResponse.output_text || (visionResponse.output?.[0] as any)?.content?.[0]?.text || "";
                
                // Parse structured response
                const costMatch = analysis.match(/COST:\s*£?(\d+)/i) || analysis.match(/COST:\s*(\d+)/i);
                const severityMatch = analysis.match(/SEVERITY:\s*(low|medium|high)/i);
                const actionMatch = analysis.match(/ACTION:\s*(acceptable|clean|repair|replace)/i);
                const liabilityMatch = analysis.match(/LIABILITY:\s*(tenant|landlord|shared)/i);
                const summaryMatch = analysis.match(/SUMMARY:\s*(.+?)(?=\n(?:SEVERITY|DAMAGE|COST|ACTION|LIABILITY):|$)/is);
                const damageMatch = analysis.match(/DAMAGE:\s*(.+?)(?=\n(?:COST|ACTION|LIABILITY):|$)/is);
                
                estimatedCost = costMatch ? parseInt(costMatch[1]) : 0;

                aiComparison = {
                  summary: summaryMatch ? summaryMatch[1].trim() : analysis.replace(/\*\*/g, ''),
                  differences: summaryMatch ? summaryMatch[1].trim() : analysis.replace(/\*\*/g, ''),
                  damage: damageMatch ? damageMatch[1].trim() : null,
                  severity: severityMatch ? severityMatch[1].toLowerCase() : "medium",
                  action: actionMatch ? actionMatch[1].toLowerCase() : "review",
                  suggestedLiability: liabilityMatch ? liabilityMatch[1].toLowerCase() : "tenant",
                  checkInPhotos,
                  checkOutPhotos,
                  estimatedCost
                };

              } catch (visionError) {
                console.error("Vision API error:", visionError);
                aiComparison = { summary: "Error analyzing images", error: true };
              }
            }

            const finalCost = Math.max(0, estimatedCost - depreciation);
            totalCost += finalCost;

            await storage.createComparisonReportItem({
              comparisonReportId: report.id,
              checkInEntryId: checkInEntry?.id || null,
              checkOutEntryId: checkOutEntry.id,
              sectionRef: checkOutEntry.sectionRef,
              itemRef: checkOutEntry.itemRef || null,
              fieldKey: checkOutEntry.fieldKey,
              aiComparisonJson: aiComparison,
              estimatedCost: estimatedCost.toString(),
              depreciation: depreciation.toString(),
              finalCost: finalCost.toString(),
            });

            itemAnalyses.push({
              sectionRef: checkOutEntry.sectionRef,
              fieldKey: checkOutEntry.fieldKey,
              analysis: aiComparison.summary,
              cost: finalCost
            });
          }

          await storage.updateComparisonReport(report.id, {
            totalEstimatedCost: totalCost.toString(),
            aiAnalysisJson: {
              summary: `Comparison complete. ${markedEntries.length} items analyzed. Total estimated cost: £${totalCost}`,
              items: itemAnalyses
            }
          });

          await storage.updateOrganizationCredits(
            organization.id,
            (organization.creditsRemaining ?? 0) - 2
          );

          await storage.createCreditTransaction({
            organizationId: organization.id,
            amount: -2,
            type: "comparison",
            description: `Comparison report generation for property`,
            relatedId: report.id,
          });

        } catch (asyncError) {
          console.error("Error in async comparison processing:", asyncError);
        }
      })();

      res.json({ report, created: true });
    } catch (error) {
      console.error("Error auto-creating comparison report:", error);
      res.status(500).json({ message: "Failed to auto-create comparison report" });
    }
  });

  // Generate comparison report from check-out inspection (comprehensive version with liability assessment)
  app.post("/api/comparison-reports", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      // Validate request body
      const validation = generateComparisonSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { propertyId, checkInInspectionId, checkOutInspectionId } = validation.data;

      // Check user authorization
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Verify property ownership
      const property = await storage.getProperty(propertyId);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Not authorized to access this property" });
      }

      // Get tenant assigned to property (optional - may be null for vacant units)
      const tenantAssignments = await storage.getTenantAssignmentsByProperty(propertyId, user.organizationId);
      const activeTenant = tenantAssignments.find(ta => ta.isActive);

      // Check credits (2 credits for comparison report generation)
      const organization = await storage.getOrganization(user.organizationId);
      if (!organization || (organization.creditsRemaining ?? 0) < 2) {
        return res.status(402).json({ message: "Insufficient credits (2 required for comparison report)" });
      }

      // Get inspection entries marked for review from check-out inspection
      const checkOutEntries = await storage.getInspectionEntries(checkOutInspectionId);
      const markedEntries = checkOutEntries.filter(entry => entry.markedForReview);

      if (markedEntries.length === 0) {
        return res.status(400).json({ message: "No inspection entries marked for review. Please mark items for review during check-out inspection." });
      }

      // Get all check-in entries for matching
      const checkInEntries = await storage.getInspectionEntries(checkInInspectionId);

      console.log(`[Manual Create Comparison] Creating report for property ${propertyId}`, {
        checkInInspectionId,
        checkOutInspectionId,
        hasTenant: !!activeTenant,
        tenantId: activeTenant?.tenantId || null
      });

      // Create comparison report (tenant may be null for vacant units)
      const report = await storage.createComparisonReport({
        organizationId: user.organizationId,
        propertyId,
        checkInInspectionId,
        checkOutInspectionId,
        tenantId: activeTenant?.tenantId || null,
        status: "draft",
        totalEstimatedCost: "0",
        aiAnalysisJson: { summary: "Processing...", items: [] },
        generatedBy: user.id,
      });

      // Process each marked entry asynchronously (don't block response)
      // In production, this would be a background job
      (async () => {
        try {
          let totalCost = 0;
          const itemAnalyses: any[] = [];

          for (const checkOutEntry of markedEntries) {
            // Find matching check-in entry
            const checkInEntry = checkInEntries.find(
              e => e.sectionRef === checkOutEntry.sectionRef && 
                   e.fieldKey === checkOutEntry.fieldKey
            );

            let aiComparison: any = { summary: "No images to compare" };
            let estimatedCost = 0;
            let depreciation = 0;

            // AI image comparison using OpenAI Vision API
            if (checkOutEntry.photos && checkOutEntry.photos.length > 0) {
              try {
                const checkInPhotos = checkInEntry?.photos || [];
                const checkOutPhotos = checkOutEntry.photos || [];

                // Helper function to convert photo URL to base64 data URL if needed
                const convertPhotoToDataUrl = async (photo: string): Promise<string | null> => {
                  try {
                    // If already a full HTTP URL, validate and use it directly
                    if (photo.startsWith("http://") || photo.startsWith("https://")) {
                      // Validate URL format
                      try {
                        new URL(photo);
                        return photo;
                      } catch {
                        console.warn(`[ComparisonReport] Invalid HTTP URL format: ${photo.substring(0, 50)}...`);
                        return null;
                      }
                    }
                    
                    // If already a data URL, validate format
                    if (photo.startsWith("data:")) {
                      // Basic validation: should have format data:image/...;base64,...
                      if (photo.match(/^data:image\/[^;]+;base64,/)) {
                        // Check if data URL is not too large (OpenAI has limits)
                        if (photo.length > 20 * 1024 * 1024) { // 20MB limit
                          console.warn(`[ComparisonReport] Data URL too large (${Math.round(photo.length / 1024)}KB), skipping`);
                          return null;
                        }
                        return photo;
                      } else {
                        console.warn(`[ComparisonReport] Invalid data URL format: ${photo.substring(0, 50)}...`);
                        return null;
                      }
                    }
                    
                    // Convert relative path to base64 data URL
                    const objectStorageService = new ObjectStorageService();
                    const photoPath = photo.startsWith('/objects/') ? photo : `/objects/${photo}`;
                    const objectFile = await objectStorageService.getObjectEntityFile(photoPath);
                    const fileBuffer = await fs.readFile(objectFile.name);
                    
                    // Check file size (OpenAI has limits on data URLs)
                    const maxSize = 20 * 1024 * 1024; // 20MB
                    if (fileBuffer.length > maxSize) {
                      console.warn(`[ComparisonReport] Photo too large (${Math.round(fileBuffer.length / 1024)}KB), skipping: ${photoPath}`);
                      return null;
                    }
                    
                    // Detect MIME type from buffer
                    let contentType = detectImageMimeType(fileBuffer);
                    if (!contentType || !contentType.startsWith('image/')) {
                      contentType = 'image/jpeg';
                    }
                    
                    // Convert to base64 data URL
                    const base64Data = fileBuffer.toString('base64');
                    const dataUrl = `data:${contentType};base64,${base64Data}`;
                    
                    // Validate the resulting data URL
                    if (!dataUrl.match(/^data:image\/[^;]+;base64,/)) {
                      console.error(`[ComparisonReport] Failed to create valid data URL for: ${photoPath}`);
                      return null;
                    }
                    
                    return dataUrl;
                  } catch (error: any) {
                    console.error(`[ComparisonReport] Error converting photo ${photo} to data URL:`, error.message);
                    return null;
                  }
                };

                // Prepare image content for Vision API
                const imageContent: any[] = [];
                
                // Add check-in photos (if available)
                if (checkInPhotos.length > 0) {
                  imageContent.push({
                    type: "text",
                    text: "CHECK-IN PHOTOS (baseline condition):"
                  });
                  const checkInPhotoUrls = await Promise.all(
                    checkInPhotos.slice(0, 2).map(convertPhotoToDataUrl)
                  );
                  for (const photoUrl of checkInPhotoUrls) {
                    if (photoUrl && typeof photoUrl === 'string' && photoUrl.length > 0) {
                      // Validate URL format before adding
                      if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://') || 
                          photoUrl.match(/^data:image\/[^;]+;base64,/)) {
                        // Pass URL as string directly (matching pattern used elsewhere in codebase)
                        imageContent.push({
                          type: "image_url",
                          image_url: photoUrl
                        });
                      } else {
                        console.warn(`[ComparisonReport] Skipping invalid check-in photo URL format: ${photoUrl.substring(0, 50)}...`);
                      }
                    }
                  }
                }

                // Add check-out photos
                imageContent.push({
                  type: "text",
                  text: "CHECK-OUT PHOTOS (current condition):"
                });
                  const checkOutPhotoUrls = await Promise.all(
                    checkOutPhotos.slice(0, 2).map(convertPhotoToDataUrl)
                  );
                  for (const photoUrl of checkOutPhotoUrls) {
                    if (photoUrl && typeof photoUrl === 'string' && photoUrl.length > 0) {
                      // Validate URL format before adding
                      if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://') || 
                          photoUrl.match(/^data:image\/[^;]+;base64,/)) {
                        // Pass URL as string directly (matching pattern used elsewhere in codebase)
                        imageContent.push({
                          type: "image_url",
                          image_url: photoUrl
                        });
                      } else {
                        console.warn(`[ComparisonReport] Skipping invalid check-out photo URL format: ${photoUrl.substring(0, 50)}...`);
                      }
                    }
                  }

                // Check if we have any valid images before making API call
                const hasValidImages = imageContent.some(item => item.type === "image_url");
                if (!hasValidImages) {
                  console.warn(`[ComparisonReport] No valid images found for entry ${checkOutEntry.fieldKey}, skipping AI analysis`);
                  aiComparison = { summary: "No valid images available for comparison" };
                } else {
                  // Define prompt before using it
                  const prompt = `You are a professional BTR property inspector. Location: ${checkOutEntry.sectionRef} - ${checkOutEntry.fieldKey}

CRITICAL: The "differences" field must contain EXACTLY 100 words. Count them. This is mandatory for legal documentation.

ANALYSIS REQUIREMENTS:
- Compare baseline (check-in) to current (check-out) condition
- Identify ALL damage: scratches, stains, dents, tears, discoloration, wear
- Note specific locations: "top left corner", "center panel", "near handle"
- Distinguish fair wear (gradual fading, minor scuffs) from tenant damage (burns, holes, excessive staining)

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "differences": "EXACTLY 100 WORDS describing: 1) Overall condition change between photos, 2) Specific damage locations and types observed, 3) Whether damage exceeds normal fair wear and tear, 4) Evidence supporting your liability assessment. Be detailed, specific, and professional.",
  "damage": "1-2 sentence summary of main damage",
  "severity": "low or medium or high",
  "repair_description": "Specific repairs needed",
  "suggested_liability": "tenant or landlord or shared",
  "estimated_cost_range": {"min": 0, "max": 0}
}`;

                  // Log image content for debugging (without full data URLs)
                  const imageCount = imageContent.filter(item => item.type === "image_url").length;
                  console.log(`[ComparisonReport] Sending ${imageCount} images for AI analysis on entry ${checkOutEntry.fieldKey}`);
                  
                  // Build content array with text and images
                  const content = [
                    { type: "text", text: prompt },
                    ...imageContent
                  ];
                  
                  // Log content structure for debugging (without full URLs)
                  console.log(`[ComparisonReport] Content structure:`, content.map((c, idx) => ({
                    index: idx,
                    type: c.type,
                    hasImageUrl: !!c.image_url,
                    urlType: typeof c.image_url,
                    urlPreview: c.image_url ? (typeof c.image_url === 'string' ? c.image_url.substring(0, 50) + '...' : 'object') : 'none'
                  })));
                  
                  // Validate all image URLs before sending
                  const normalizedContent = normalizeApiContent(content);
                  
                  // Double-check all image URLs are valid strings after normalization
                  for (let i = 0; i < normalizedContent.length; i++) {
                    const item = normalizedContent[i];
                    if (item.type === "input_image") {
                      const url = item.image_url;
                      if (typeof url !== 'string') {
                        console.error(`[ComparisonReport] Invalid image_url type at index ${i}: ${typeof url}, expected string. Item:`, JSON.stringify(item).substring(0, 200));
                        throw new Error(`[ComparisonReport] Invalid image_url type at index ${i}: ${typeof url}, expected string`);
                      }
                      if (!url || url.length === 0) {
                        console.error(`[ComparisonReport] Empty image_url at index ${i}`);
                        throw new Error(`[ComparisonReport] Empty image_url at index ${i}`);
                      }
                      // Validate URL format
                      const isValidHttp = url.startsWith('http://') || url.startsWith('https://');
                      const isValidDataUrl = url.match(/^data:image\/[^;]+;base64,/);
                      if (!isValidHttp && !isValidDataUrl) {
                        console.error(`[ComparisonReport] Invalid image_url format at index ${i}: ${url.substring(0, 100)}...`);
                        throw new Error(`[ComparisonReport] Invalid image_url format at index ${i}: expected http/https URL or data URL`);
                      }
                      // Log valid URL (truncated)
                      console.log(`[ComparisonReport] Valid image URL at index ${i}: ${url.substring(0, 50)}... (${url.length} chars)`);
                    }
                  }
                  
                  // Call OpenAI Vision API
                  const response = await getOpenAI().responses.create({
                    model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
                    input: [
                      {
                        role: "user",
                        content: normalizedContent
                      }
                    ],
                    max_output_tokens: 800,
                  });

                let aiResponse = response.output_text || (response.output?.[0] as any)?.content?.[0]?.text || "{}";
                
                // Strip markdown code blocks and asterisks from the response
                aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').replace(/\*\*/g, '').trim();
                
                try {
                  aiComparison = JSON.parse(aiResponse);
                  // Use mid-point of cost range as estimate
                  estimatedCost = ((aiComparison.estimated_cost_range?.min || 0) + 
                                   (aiComparison.estimated_cost_range?.max || 0)) / 2;
                  // Add photos to the comparison object
                  aiComparison.checkInPhotos = checkInEntry?.photos || [];
                  aiComparison.checkOutPhotos = checkOutEntry.photos || [];
                } catch {
                  aiComparison = { 
                    summary: aiResponse,
                    checkInPhotos: checkInEntry?.photos || [],
                    checkOutPhotos: checkOutEntry.photos || []
                  };
                }
                }
              } catch (error) {
                console.error("Error in AI comparison:", error);
                aiComparison = { error: "Failed to analyze images" };
              }
            }

            // Calculate depreciation using actual asset data
            if (checkOutEntry.assetInventoryId) {
              try {
                const asset = await storage.getAssetById(checkOutEntry.assetInventoryId);
                if (asset && asset.purchasePrice && asset.datePurchased) {
                  const purchasePrice = parseFloat(asset.purchasePrice);
                  const purchaseDate = new Date(asset.datePurchased);
                  const currentDate = new Date();
                  
                  // Calculate years since purchase
                  const yearsSincePurchase = (currentDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                  
                  // Use asset's depreciation rate or calculate from expected lifespan
                  let annualDepreciationAmount = 0;
                  if (asset.depreciationPerYear) {
                    annualDepreciationAmount = parseFloat(asset.depreciationPerYear);
                  } else if (asset.expectedLifespanYears && asset.expectedLifespanYears > 0) {
                    annualDepreciationAmount = purchasePrice / asset.expectedLifespanYears;
                  }
                  
                  // If no depreciation data available, fall back to 10%
                  if (annualDepreciationAmount > 0) {
                    // Calculate total accumulated depreciation
                    const accumulatedDepreciation = annualDepreciationAmount * yearsSincePurchase;
                    
                    // Apply depreciation as percentage of repair cost
                    // If asset has depreciated 50% and repair costs $100, tenant pays $50
                    const depreciationPercentage = Math.min(1.0, accumulatedDepreciation / purchasePrice);
                    depreciation = estimatedCost * depreciationPercentage;
                  } else {
                    // Asset exists but has no depreciation metadata: use 10% fallback
                    depreciation = estimatedCost * 0.10;
                  }
                } else {
                  // Fallback: 10% depreciation if asset data is incomplete
                  depreciation = estimatedCost * 0.10;
                }
              } catch (error) {
                console.error("Error calculating asset depreciation:", error);
                depreciation = estimatedCost * 0.10;
              }
            } else {
              // No linked asset: use conservative 10% depreciation
              depreciation = estimatedCost * 0.10;
            }

            const finalCost = Math.max(0, estimatedCost - depreciation);
            totalCost += finalCost;

            itemAnalyses.push({
              sectionRef: checkOutEntry.sectionRef,
              fieldKey: checkOutEntry.fieldKey,
              checkInPhotos: checkInEntry?.photos || [],
              checkOutPhotos: checkOutEntry.photos || [],
              aiComparison,
              estimatedCost,
              depreciation,
              finalCost,
            });

            // Create comparison report item
            await storage.createComparisonReportItem({
              comparisonReportId: report.id,
              checkInEntryId: checkInEntry?.id || null,
              checkOutEntryId: checkOutEntry.id,
              sectionRef: checkOutEntry.sectionRef,
              itemRef: checkOutEntry.itemRef,
              fieldKey: checkOutEntry.fieldKey,
              aiComparisonJson: aiComparison,
              estimatedCost: estimatedCost.toFixed(2),
              depreciation: depreciation.toFixed(2),
              finalCost: finalCost.toFixed(2),
            });
          }

          // Update report with total cost and analysis
          await storage.updateComparisonReport(report.id, {
            totalEstimatedCost: totalCost.toFixed(2),
            aiAnalysisJson: { 
              summary: `Analyzed ${markedEntries.length} items. Total estimated cost: $${totalCost.toFixed(2)}`, 
              items: itemAnalyses 
            },
            status: "under_review",
          });

        } catch (error) {
          console.error("Error processing comparison items:", error);
        }
      })();

      // Deduct credits
      await storage.updateOrganizationCredits(
        organization.id,
        (organization.creditsRemaining ?? 0) - 2
      );

      await storage.createCreditTransaction({
        organizationId: organization.id,
        amount: -2,
        type: "comparison",
        description: `Comparison report generation for property`,
        relatedId: report.id,
      });

      res.json(report);
    } catch (error) {
      console.error("Error generating comparison report:", error);
      res.status(500).json({ message: "Failed to generate comparison report" });
    }
  });

  app.get("/api/comparisons/:propertyId", isAuthenticated, async (req, res) => {
    try {
      const { propertyId } = req.params;
      const reports = await storage.getComparisonReportsByProperty(propertyId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching comparisons:", error);
      res.status(500).json({ message: "Failed to fetch comparisons" });
    }
  });

  // List all comparison reports for organization (operators only)
  app.get("/api/comparison-reports", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const reports = await storage.getComparisonReportsByOrganization(user.organizationId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching comparison reports:", error);
      res.status(500).json({ message: "Failed to fetch comparison reports" });
    }
  });

  // Get single comparison report with items
  app.get("/api/comparison-reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      // Verify organization ownership
      if (report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get report items
      const items = await storage.getComparisonReportItems(id);

      res.json({ ...report, items });
    } catch (error) {
      console.error("Error fetching comparison report:", error);
      res.status(500).json({ message: "Failed to fetch comparison report" });
    }
  });

  // Update comparison report status
  app.patch("/api/comparison-reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      // Verify organization ownership
      if (report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate status updates
      const { status } = req.body;
      const validStatuses = ["draft", "under_review", "awaiting_signatures", "signed", "filed"];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      const updatedReport = await storage.updateComparisonReport(id, req.body);
      res.json(updatedReport);
    } catch (error) {
      console.error("Error updating comparison report:", error);
      res.status(500).json({ message: "Failed to update comparison report" });
    }
  });

  // Get comparison report comments
  app.get("/api/comparison-reports/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      // Verify organization ownership
      if (report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const comments = await storage.getComparisonComments(id);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Update comparison report item (operator only)
  app.patch("/api/comparison-report-items/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Get item and verify access through report
      const items = await storage.getComparisonReportItems(req.body.comparisonReportId);
      const item = items.find((i: any) => i.id === id);
      
      if (!item) {
        return res.status(404).json({ message: "Comparison report item not found" });
      }

      const report = await storage.getComparisonReport(item.comparisonReportId);
      if (!report || report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate allowed fields
      const allowedFields = ["status", "liabilityDecision", "estimatedCost", "depreciation", "finalCost", "operatorNotes"];
      const updates: any = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // Validate status if provided (must match comparisonItemStatusEnum)
      if (updates.status) {
        const validStatuses = ["pending", "reviewed", "disputed", "resolved", "waived"];
        if (!validStatuses.includes(updates.status)) {
          return res.status(400).json({ message: "Invalid status value" });
        }
      }

      // Validate liability decision if provided
      if (updates.liabilityDecision) {
        const validLiability = ["tenant", "landlord", "shared", "waived"];
        if (!validLiability.includes(updates.liabilityDecision)) {
          return res.status(400).json({ message: "Invalid liability decision value" });
        }
      }

      const updatedItem = await storage.updateComparisonReportItem(id, updates);

      // Recalculate total cost for the report if costs changed
      if (updates.finalCost !== undefined) {
        const allItems = await storage.getComparisonReportItems(report.id);
        const totalCost = allItems.reduce((sum: number, i: any) => {
          return sum + parseFloat(i.finalCost || "0");
        }, 0);
        await storage.updateComparisonReport(report.id, { totalEstimatedCost: totalCost.toFixed(2) });
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating comparison report item:", error);
      res.status(500).json({ message: "Failed to update comparison report item" });
    }
  });

  // Add comparison report comment (with internal flag support for operators)
  app.post("/api/comparison-reports/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { content, isInternal } = req.body;
      const user = await storage.getUser(req.user.id);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      // Verify organization ownership
      if (report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const isOperator = user.role === "owner" || user.role === "clerk";
      const authorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

      const comment = await storage.createComparisonComment({
        comparisonReportId: id,
        userId: user.id,
        authorName,
        authorRole: isOperator ? "operator" : "tenant",
        content: content.trim(),
        // Operators can choose internal or public; tenants are always public
        isInternal: isOperator ? (isInternal === true) : false,
      });

      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // Electronic signature for comparison reports
  app.post("/api/comparison-reports/:id/sign", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { signature } = req.body; // Typed name
      const user = await storage.getUser(req.user.id);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      if (!signature || signature.trim().length === 0) {
        return res.status(400).json({ message: "Signature (typed name) is required" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      // Verify organization ownership
      if (report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get IP address from request
      const ipAddress = req.ip || req.connection?.remoteAddress || "unknown";

      // Determine who is signing
      const isOperator = user.role === "owner" || user.role === "clerk";
      const isTenant = user.role === "tenant";

      if (!isOperator && !isTenant) {
        return res.status(403).json({ message: "Only operators and tenants can sign comparison reports" });
      }

      // Check if already signed by this party
      if (isOperator && report.operatorSignature) {
        return res.status(400).json({ message: "Operator has already signed this report" });
      }
      if (isTenant && report.tenantSignature) {
        return res.status(400).json({ message: "Tenant has already signed this report" });
      }

      // Update signature fields
      const updates: any = {};
      const now = new Date();

      if (isOperator) {
        updates.operatorSignature = signature.trim();
        updates.operatorSignedAt = now;
        updates.operatorSignedIp = ipAddress;
      } else if (isTenant) {
        updates.tenantSignature = signature.trim();
        updates.tenantSignedAt = now;
        updates.tenantSignedIp = ipAddress;
      }

      // Check if both parties have now signed
      const bothSigned = (
        (isOperator || report.operatorSignature) && 
        (isTenant || report.tenantSignature)
      );

      if (bothSigned) {
        updates.status = "signed";
      }

      const updatedReport = await storage.updateComparisonReport(id, updates);
      res.json(updatedReport);
    } catch (error) {
      console.error("Error signing comparison report:", error);
      res.status(500).json({ message: "Failed to sign comparison report" });
    }
  });

  // Generate Comparison Report PDF with branding
  app.get("/api/comparison-reports/:id/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      // Verify organization ownership
      if (report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get report items
      const items = await storage.getComparisonReportItems(id);
      
      // Get property and tenant info
      const property = await storage.getProperty(report.propertyId);
      const block = property?.blockId ? await storage.getBlock(property.blockId) : null;
      
      // Get check-in and check-out inspections
      const checkInInspection = await storage.getInspection(report.checkInInspectionId);
      const checkOutInspection = await storage.getInspection(report.checkOutInspectionId);
      
      // Get comments for the report
      const comments = await storage.getComparisonComments(id);
      
      // Get organization branding
      const organization = await storage.getOrganization(user.organizationId);
      const branding: ReportBrandingInfo = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingWebsite: organization.brandingWebsite,
      } : {};

      // Generate HTML for the comparison report
      const html = generateComparisonReportHTML(
        report,
        items,
        property,
        block,
        checkInInspection,
        checkOutInspection,
        comments.filter((c: any) => !c.isInternal), // Only public comments in PDF
        branding
      );

      let browser;
      try {
        browser = await launchPuppeteerBrowser();

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

        res.contentType("application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="comparison-report-${id}.pdf"`);
        res.send(Buffer.from(pdf));
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    } catch (error) {
      console.error("Error generating comparison report PDF:", error);
      res.status(500).json({ message: "Failed to generate comparison report PDF" });
    }
  });

  // Send Comparison Report to Finance Department
  app.post("/api/comparison-reports/:id/send-to-finance", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { includePdf } = req.body;
      
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const organization = await storage.getOrganization(user.organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      if (!organization.financeEmail) {
        return res.status(400).json({ message: "Finance email not configured. Please set the finance department email in Settings." });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      if (report.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const items = await storage.getComparisonReportItems(id);
      const property = await storage.getProperty(report.propertyId);
      const block = property?.blockId ? await storage.getBlock(property.blockId) : null;
      const checkInInspection = await storage.getInspection(report.checkInInspectionId);
      const checkOutInspection = await storage.getInspection(report.checkOutInspectionId);

      // Get tenant info if available
      let tenantName = 'N/A';
      if (report.tenantId) {
        const tenant = await storage.getUser(report.tenantId);
        if (tenant) {
          tenantName = `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || tenant.email;
        }
      }

      // Calculate totals
      let totalEstimatedCost = 0;
      let totalDepreciation = 0;
      let totalFinalCost = 0;
      let tenantLiableAmount = 0;
      let landlordLiableAmount = 0;
      let sharedLiableAmount = 0;
      let waivedAmount = 0;
      let tenantLiableCount = 0;
      let landlordLiableCount = 0;
      let sharedCount = 0;
      let waivedCount = 0;

      items.forEach((item: any) => {
        const estimatedCost = parseFloat(item.estimatedCost || '0');
        const depreciationAmount = parseFloat(item.depreciationAmount || '0');
        const finalCost = parseFloat(item.finalCost || '0');

        totalEstimatedCost += estimatedCost;
        totalDepreciation += depreciationAmount;
        totalFinalCost += finalCost;

        switch (item.liability) {
          case 'tenant':
            tenantLiableAmount += finalCost;
            tenantLiableCount++;
            break;
          case 'landlord':
            landlordLiableAmount += finalCost;
            landlordLiableCount++;
            break;
          case 'shared':
            sharedLiableAmount += finalCost;
            sharedCount++;
            break;
          case 'waived':
            waivedAmount += finalCost;
            waivedCount++;
            break;
        }
      });

      const senderName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
      const companyName = organization.brandingName || organization.name;

      // Prepare PDF attachment if requested
      let pdfAttachment;
      if (includePdf) {
        try {
          const branding: ReportBrandingInfo = {
            logoUrl: organization.logoUrl,
            brandingName: organization.brandingName,
            brandingEmail: organization.brandingEmail,
            brandingPhone: organization.brandingPhone,
            brandingWebsite: organization.brandingWebsite,
          };

          const comments = await storage.getComparisonComments(id);
          const html = generateComparisonReportHTML(
            report,
            items,
            property,
            block,
            checkInInspection,
            checkOutInspection,
            comments.filter((c: any) => !c.isInternal),
            branding
          );

          const browser = await launchPuppeteerBrowser();
          try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: "networkidle0" });
            const pdf = await page.pdf({
              format: "A4",
              landscape: true,
              printBackground: true,
              margin: { top: "15mm", right: "12mm", bottom: "15mm", left: "12mm" },
            });
            pdfAttachment = {
              filename: `comparison-report-${id}.pdf`,
              content: Buffer.from(pdf)
            };
          } finally {
            await browser.close();
          }
        } catch (pdfError) {
          console.error("Error generating PDF for finance email:", pdfError);
        }
      }

      await sendComparisonReportToFinance(organization.financeEmail, {
        reportId: id,
        propertyName: property?.name || 'Unknown Property',
        propertyAddress: property?.address || '',
        blockName: block?.name || '',
        tenantName,
        checkInDate: checkInInspection?.completedDate 
          ? format(new Date(checkInInspection.completedDate), 'dd MMM yyyy')
          : 'N/A',
        checkOutDate: checkOutInspection?.completedDate 
          ? format(new Date(checkOutInspection.completedDate), 'dd MMM yyyy')
          : 'N/A',
        totalEstimatedCost,
        totalDepreciation,
        totalFinalCost,
        tenantLiableAmount,
        landlordLiableAmount,
        sharedLiableAmount,
        waivedAmount,
        itemsCount: items.length,
        tenantLiableCount,
        landlordLiableCount,
        sharedCount,
        waivedCount,
        status: report.status,
        signedByOperator: !!report.operatorSignature,
        signedByTenant: !!report.tenantSignature,
        operatorSignature: report.operatorSignature || undefined,
        tenantSignature: report.tenantSignature || undefined,
        operatorSignedAt: report.operatorSignedAt 
          ? format(new Date(report.operatorSignedAt), 'dd MMM yyyy HH:mm')
          : undefined,
        tenantSignedAt: report.tenantSignedAt 
          ? format(new Date(report.tenantSignedAt), 'dd MMM yyyy HH:mm')
          : undefined,
        generatedAt: format(new Date(), 'dd MMM yyyy HH:mm'),
        senderName,
        companyName,
        pdfAttachment,
      });

      res.json({ 
        success: true, 
        message: `Report sent to finance department (${organization.financeEmail})` 
      });
    } catch (error) {
      console.error("Error sending comparison report to finance:", error);
      res.status(500).json({ message: "Failed to send report to finance department" });
    }
  });

  // HTML generation function for Comparison Report
  function generateComparisonReportHTML(
    report: any,
    items: any[],
    property: any,
    block: any,
    checkInInspection: any,
    checkOutInspection: any,
    comments: any[],
    branding?: ReportBrandingInfo
  ) {
    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Branding for cover page
    const companyName = branding?.brandingName || "Inspect360";
    const hasLogo = !!branding?.logoUrl;
    const logoHtml = hasLogo
      ? `<img src="${sanitizeReportUrl(branding.logoUrl!)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
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

    // Status badge color
    const statusColors: Record<string, { bg: string; color: string }> = {
      draft: { bg: '#e5e7eb', color: '#374151' },
      under_review: { bg: '#00D5CC', color: 'white' },
      awaiting_signatures: { bg: '#f59e0b', color: 'white' },
      signed: { bg: '#10b981', color: 'white' },
      filed: { bg: '#6b7280', color: 'white' },
    };
    const statusStyle = statusColors[report.status] || statusColors.draft;
    const statusLabel = report.status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

    // Calculate totals
    const totalEstimated = items.reduce((sum, item) => sum + parseFloat(item.estimatedCost || '0'), 0);
    const totalDepreciation = items.reduce((sum, item) => sum + parseFloat(item.depreciation || '0'), 0);
    const totalFinal = items.reduce((sum, item) => sum + parseFloat(item.finalCost || '0'), 0);
    const tenantLiableCount = items.filter(i => i.liabilityDecision === 'tenant').length;
    const landlordLiableCount = items.filter(i => i.liabilityDecision === 'landlord').length;
    const sharedCount = items.filter(i => i.liabilityDecision === 'shared').length;
    const waivedCount = items.filter(i => i.liabilityDecision === 'waived').length;

    // Liability badge colors
    const liabilityColors: Record<string, { bg: string; color: string }> = {
      tenant: { bg: '#ef4444', color: 'white' },
      landlord: { bg: '#3b82f6', color: 'white' },
      shared: { bg: '#f59e0b', color: 'white' },
      waived: { bg: '#6b7280', color: 'white' },
    };

    // Generate item rows
    const itemRows = items.map((item, index) => {
      const aiAnalysis = item.aiComparisonJson || {};
      const liability = liabilityColors[item.liabilityDecision] || liabilityColors.tenant;
      const liabilityLabel = item.liabilityDecision ? 
        item.liabilityDecision.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : 
        'Pending';
      
      const checkInPhotos = aiAnalysis.checkInPhotos || [];
      const checkOutPhotos = aiAnalysis.checkOutPhotos || [];
      
      return `
        <div class="item-card" style="page-break-inside: avoid; margin-bottom: 20px;">
          <div class="item-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f9fafb; border-radius: 8px 8px 0 0; border: 1px solid #e5e7eb; border-bottom: none;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-weight: 700; color: #00D5CC; font-size: 14px;">#${index + 1}</span>
              <span style="font-weight: 600; font-size: 14px;">${escapeHtml(item.itemRef || item.fieldKey || 'Item')}</span>
            </div>
            <span style="padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${liability.bg}; color: ${liability.color};">
              ${liabilityLabel}
            </span>
          </div>
          <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
            ${item.aiSummary ? `
              <div style="margin-bottom: 16px;">
                <div style="font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 4px; font-weight: 600;">AI Analysis</div>
                <div style="font-size: 13px; color: #374151; line-height: 1.5;">${escapeHtml(item.aiSummary)}</div>
              </div>
            ` : ''}
            
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 16px;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 8px; font-weight: 600;">Check-In Photos</div>
                ${checkInPhotos.length > 0 ? `
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${checkInPhotos.slice(0, 3).map((photo: string) => `
                      <img src="${sanitizeReportUrl(photo)}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;" />
                    `).join('')}
                    ${checkInPhotos.length > 3 ? `<span style="font-size: 12px; color: #666; align-self: center;">+${checkInPhotos.length - 3} more</span>` : ''}
                  </div>
                ` : '<span style="font-size: 12px; color: #999;">No photos</span>'}
              </div>
              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 8px; font-weight: 600;">Check-Out Photos</div>
                ${checkOutPhotos.length > 0 ? `
                  <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${checkOutPhotos.slice(0, 3).map((photo: string) => `
                      <img src="${sanitizeReportUrl(photo)}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;" />
                    `).join('')}
                    ${checkOutPhotos.length > 3 ? `<span style="font-size: 12px; color: #666; align-self: center;">+${checkOutPhotos.length - 3} more</span>` : ''}
                  </div>
                ` : '<span style="font-size: 12px; color: #999;">No photos</span>'}
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 2px;">Estimated Cost</div>
                <div style="font-size: 16px; font-weight: 700; color: #374151;">£${parseFloat(item.estimatedCost || '0').toFixed(2)}</div>
              </div>
              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 2px;">Depreciation</div>
                <div style="font-size: 16px; font-weight: 700; color: #f59e0b;">-£${parseFloat(item.depreciation || '0').toFixed(2)}</div>
              </div>
              <div>
                <div style="font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 2px;">Final Cost</div>
                <div style="font-size: 16px; font-weight: 700; color: #00D5CC;">£${parseFloat(item.finalCost || '0').toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Generate comments section
    const commentsHtml = comments.length > 0 ? `
      <div style="page-break-before: always;">
        <h2 style="font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px; border-bottom: 2px solid #00D5CC; padding-bottom: 8px;">Discussion Thread</h2>
        ${comments.map(comment => `
          <div style="padding: 12px; margin-bottom: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #00D5CC;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 600; font-size: 13px;">${escapeHtml(comment.authorName)}</span>
              <span style="font-size: 11px; color: #666;">${format(new Date(comment.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
            </div>
            <div style="font-size: 13px; color: #374151; line-height: 1.5;">${escapeHtml(comment.content)}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    // Signature section
    const signatureHtml = `
      <div style="page-break-before: always;">
        <h2 style="font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 16px; border-bottom: 2px solid #00D5CC; padding-bottom: 8px;">Electronic Signatures</h2>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;">
          <div style="padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <div style="font-weight: 600; margin-bottom: 12px; font-size: 14px;">Operator Signature</div>
            ${report.operatorSignature ? `
              <div style="padding: 16px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">
                <div style="font-size: 18px; font-weight: 700; color: #166534; font-style: italic; margin-bottom: 8px;">${escapeHtml(report.operatorSignature)}</div>
                <div style="font-size: 11px; color: #166534;">
                  Signed on ${report.operatorSignedAt ? format(new Date(report.operatorSignedAt), "MMMM d, yyyy 'at' h:mm a") : 'N/A'}
                </div>
              </div>
            ` : `
              <div style="padding: 16px; background: #fef2f2; border-radius: 6px; border: 1px solid #fecaca; text-align: center;">
                <span style="color: #dc2626; font-size: 13px;">Pending Signature</span>
              </div>
            `}
          </div>
          <div style="padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <div style="font-weight: 600; margin-bottom: 12px; font-size: 14px;">Tenant Signature</div>
            ${report.tenantSignature ? `
              <div style="padding: 16px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">
                <div style="font-size: 18px; font-weight: 700; color: #166534; font-style: italic; margin-bottom: 8px;">${escapeHtml(report.tenantSignature)}</div>
                <div style="font-size: 11px; color: #166534;">
                  Signed on ${report.tenantSignedAt ? format(new Date(report.tenantSignedAt), "MMMM d, yyyy 'at' h:mm a") : 'N/A'}
                </div>
              </div>
            ` : `
              <div style="padding: 16px; background: #fef2f2; border-radius: 6px; border: 1px solid #fecaca; text-align: center;">
                <span style="color: #dc2626; font-size: 13px;">Pending Signature</span>
              </div>
            `}
          </div>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; font-size: 11px; color: #666; text-align: center;">
          Electronic signatures on this document are legally binding under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act).
        </div>
      </div>
    `;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
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
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-container { margin-bottom: 32px; }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 24px;
      font-weight: 600;
      margin-top: 12px;
      opacity: 0.95;
    }
    .cover-divider {
      width: 100px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 28px 0;
      border-radius: 2px;
    }
    .cover-title { font-size: 38px; font-weight: 700; margin-bottom: 12px; }
    .cover-subtitle { font-size: 18px; opacity: 0.9; margin-bottom: 8px; }
    .cover-date { font-size: 14px; opacity: 0.8; margin-top: 16px; }
    .cover-contact {
      position: absolute;
      bottom: 32px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 1;
    }
    /* Content area - Landscape optimized */
    .content { padding: 28px 36px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #00D5CC;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .page-title { font-size: 26px; font-weight: 800; color: #00D5CC; }
    .page-date { font-size: 13px; color: #666; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #00D5CC; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; color: #00D5CC; }
    .section-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-top: 32px; margin-bottom: 14px; border-bottom: 2px solid #00D5CC; padding-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
    .info-card { padding: 16px; background: #f9fafb; border-radius: 8px; }
    .info-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px; font-weight: 600; }
    .info-value { font-size: 14px; font-weight: 600; color: #1a1a1a; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${logoHtml}
        ${companyNameHtml}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">Comparison Report</div>
      <div class="cover-subtitle">${escapeHtml(property?.name || property?.unitNumber || 'Property')}</div>
      <div class="cover-subtitle">${escapeHtml(block?.name || '')}</div>
      <div class="cover-date">Generated on ${format(new Date(report.createdAt), "MMMM d, yyyy 'at' h:mm a")}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="content">
    <div class="page-header">
      <div class="page-title">Check-In vs Check-Out Comparison</div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; background: ${statusStyle.bg}; color: ${statusStyle.color};">
          ${statusLabel}
        </span>
        <div class="page-date">${format(new Date(), "MMMM d, yyyy")}</div>
      </div>
    </div>

    <!-- Property & Inspection Info -->
    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">Property</div>
        <div class="info-value">${escapeHtml(property?.name || property?.unitNumber || 'N/A')}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">${escapeHtml(property?.address || '')}</div>
      </div>
      <div class="info-card">
        <div class="info-label">Check-In Inspection</div>
        <div class="info-value">${checkInInspection?.inspectionDate ? format(new Date(checkInInspection.inspectionDate), "MMM d, yyyy") : 'N/A'}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Type: ${escapeHtml(checkInInspection?.type || 'Check-In')}</div>
      </div>
      <div class="info-card">
        <div class="info-label">Check-Out Inspection</div>
        <div class="info-value">${checkOutInspection?.inspectionDate ? format(new Date(checkOutInspection.inspectionDate), "MMM d, yyyy") : 'N/A'}</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Type: ${escapeHtml(checkOutInspection?.type || 'Check-Out')}</div>
      </div>
    </div>

    <!-- Cost Summary -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Items</div>
        <div class="stat-value">${items.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Estimated Cost</div>
        <div class="stat-value">£${totalEstimated.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Depreciation</div>
        <div class="stat-value" style="color: #f59e0b;">-£${totalDepreciation.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Final Amount</div>
        <div class="stat-value">£${totalFinal.toFixed(2)}</div>
      </div>
    </div>

    <!-- Liability Breakdown -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
      <div style="padding: 12px; background: #fef2f2; border-radius: 6px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${tenantLiableCount}</div>
        <div style="font-size: 11px; color: #dc2626; text-transform: uppercase;">Tenant Liable</div>
      </div>
      <div style="padding: 12px; background: #eff6ff; border-radius: 6px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #2563eb;">${landlordLiableCount}</div>
        <div style="font-size: 11px; color: #2563eb; text-transform: uppercase;">Landlord</div>
      </div>
      <div style="padding: 12px; background: #fefce8; border-radius: 6px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #ca8a04;">${sharedCount}</div>
        <div style="font-size: 11px; color: #ca8a04; text-transform: uppercase;">Shared</div>
      </div>
      <div style="padding: 12px; background: #f3f4f6; border-radius: 6px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #6b7280;">${waivedCount}</div>
        <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Waived</div>
      </div>
    </div>

    <!-- Item-by-Item Comparison -->
    <h2 class="section-title">Item-by-Item Comparison</h2>
    ${items.length > 0 ? itemRows : '<div style="text-align: center; padding: 40px; color: #999;">No items in this comparison report</div>'}

    ${commentsHtml}
    
    ${signatureHtml}

    <div class="footer">
      <p>Report generated by ${escapeHtml(companyName)}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // ==================== COMPLIANCE ROUTES ====================
  
  app.post("/api/compliance", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Validate request body
      // Note: expiryDate is coerced to Date by the schema using z.coerce.date()
      const validation = insertComplianceDocumentSchema.omit({ organizationId: true, uploadedBy: true }).safeParse(req.body);
      if (!validation.success) {
        console.error("Compliance document validation errors:", validation.error.errors);
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { documentType, documentUrl, expiryDate, propertyId, blockId } = validation.data;

      const doc = await storage.createComplianceDocument({
        organizationId: user.organizationId,
        propertyId: propertyId || null,
        blockId: blockId || null,
        documentType,
        documentUrl,
        // expiryDate is already a Date object from z.coerce.date() validation
        expiryDate: expiryDate || null,
        uploadedBy: userId,
      });

      res.json(doc);
    } catch (error) {
      console.error("Error creating compliance document:", error);
      res.status(500).json({ message: "Failed to create compliance document" });
    }
  });

  app.get("/api/compliance", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const docs = await storage.getComplianceDocuments(user.organizationId);
      res.json(docs);
    } catch (error) {
      console.error("Error fetching compliance documents:", error);
      res.status(500).json({ message: "Failed to fetch compliance documents" });
    }
  });

  // Download compliance document (serves file with proper headers for download)
  app.get("/api/compliance/:id/view", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "No organization found" });
      }

      const docId = req.params.id;
      const doc = await storage.getComplianceDocument(docId);
      
      if (!doc || doc.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Compliance document not found" });
      }

      // Get the file from object storage
      const objectStorageService = new ObjectStorageService();
      
      // Normalize documentUrl - it might be absolute URL or relative path
      let documentPath = doc.documentUrl;
      if (documentPath.startsWith('http://') || documentPath.startsWith('https://')) {
        // Extract pathname from absolute URL
        try {
          const url = new URL(documentPath);
          documentPath = url.pathname;
        } catch (e) {
          // If URL parsing fails, try to extract path manually
          const match = documentPath.match(/\/objects\/[^?]+/);
          if (match) {
            documentPath = match[0];
          }
        }
      }
      
      // Ensure path starts with /objects/
      if (!documentPath.startsWith('/objects/')) {
        documentPath = `/objects/${documentPath.replace(/^\/+/, '')}`;
      }
      
      const objectFile = await objectStorageService.getObjectEntityFile(documentPath);
      
      // Read file buffer to detect actual file type (read first 4KB for detection)
      let fileBuffer: Buffer | undefined;
      let detectedContentType = 'application/octet-stream';
      
      try {
        // Verify file exists
        const [fileExists] = await objectFile.exists();
        if (!fileExists) {
          console.error(`[Compliance View] File does not exist: ${objectFile.name}`);
          return res.status(404).json({ message: "Document file not found" });
        }
        
        fileBuffer = await fs.readFile(objectFile.name);
        
        if (!fileBuffer || fileBuffer.length === 0) {
          console.error(`[Compliance View] File is empty: ${objectFile.name}`);
        } else {
          // Read first 4KB for detection (magic bytes are usually at the start)
          const sampleBuffer = fileBuffer.slice(0, Math.min(4096, fileBuffer.length));
          detectedContentType = detectFileMimeType(sampleBuffer);
          
          // Log first bytes for debugging
          const firstBytes = Array.from(sampleBuffer.slice(0, 8))
            .map(b => `0x${b.toString(16).padStart(2, '0')}`)
            .join(' ');
          console.log(`[Compliance View] File detection for ${docId}:`, {
            filePath: objectFile.name,
            firstBytes,
            detectedType: detectedContentType,
            fileSize: fileBuffer.length
          });
        }
      } catch (readError: any) {
        console.error(`[Compliance View] Error reading file for ${docId}:`, {
          error: readError?.message,
          filePath: objectFile.name,
          stack: readError?.stack
        });
        // Continue with metadata fallback
      }
      
      // Get file metadata (fallback if detection fails)
      const [metadata] = await objectFile.getMetadata();
      let contentType = detectedContentType !== 'application/octet-stream' 
        ? detectedContentType 
        : (metadata.contentType || "application/octet-stream");
      
      // If we still have octet-stream and have file buffer, try re-detection with larger sample
      if (contentType === 'application/octet-stream' && fileBuffer) {
        const largerSample = fileBuffer.slice(0, Math.min(8192, fileBuffer.length));
        const reDetected = detectFileMimeType(largerSample);
        if (reDetected !== 'application/octet-stream') {
          contentType = reDetected;
          console.log(`[Compliance View] Re-detected file type for ${docId}: ${reDetected}`);
        }
      }
      
      console.log(`[Compliance View] Document ${docId} final:`, {
        detectedType: detectedContentType,
        metadataType: metadata.contentType,
        finalType: contentType,
        documentType: doc.documentType,
        documentUrl: doc.documentUrl,
        filePath: documentPath
      });
      
      // Determine file extension from content type
      let fileExtension = 'pdf'; // default
      if (contentType === 'application/pdf') {
        fileExtension = 'pdf';
      } else if (contentType === 'application/msword') {
        fileExtension = 'doc';
      } else if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        fileExtension = 'docx';
      } else if (contentType === 'application/vnd.ms-excel') {
        fileExtension = 'xls';
      } else if (contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        fileExtension = 'xlsx';
      } else if (contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        fileExtension = 'pptx';
      } else if (contentType === 'application/zip') {
        fileExtension = 'zip';
      } else if (contentType.startsWith('image/')) {
        const imageType = contentType.split('/')[1];
        if (imageType === 'jpeg') fileExtension = 'jpg';
        else if (imageType) fileExtension = imageType;
      } else if (contentType === 'application/octet-stream') {
        // Last resort: default to PDF for compliance documents (most common)
        console.warn(`[Compliance View] Could not detect file type for ${docId}, defaulting to PDF`);
        fileExtension = 'pdf';
        // Also update content type to PDF for better browser handling
        contentType = 'application/pdf';
      } else {
        // Try to extract from content type
        const parts = contentType.split('/');
        if (parts.length > 1) {
          const subtype = parts[1].split(';')[0];
          if (subtype && subtype !== 'octet-stream') {
            fileExtension = subtype;
          }
        }
      }
      
      // Create filename from document type
      const safeDocumentType = doc.documentType.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const filename = `${safeDocumentType}.${fileExtension}`;
      
      // Encode filename for Content-Disposition header
      const encodedFilename = encodeURIComponent(filename);
      
      // Set headers for download with proper filename
      res.set({
        "Content-Type": contentType,
        "Content-Length": metadata.size,
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
        "Cache-Control": "private, max-age=3600",
      });

      // Stream the file
      const stream = objectFile.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading compliance document:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ message: "Document file not found" });
      }
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  app.get("/api/compliance/expiring", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const daysAhead = parseInt(req.query.days as string) || 90;
      const docs = await storage.getExpiringCompliance(user.organizationId, daysAhead);
      res.json(docs);
    } catch (error) {
      console.error("Error fetching expiring compliance:", error);
      res.status(500).json({ message: "Failed to fetch expiring compliance" });
    }
  });

  app.patch("/api/compliance/:id", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User must belong to an organization" });
      }

      const docId = req.params.id;
      const existingDoc = await storage.getComplianceDocument(docId);
      
      if (!existingDoc) {
        return res.status(404).json({ message: "Compliance document not found" });
      }
      
      if (existingDoc.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updateSchema = insertComplianceDocumentSchema.partial().omit({ 
        organizationId: true, 
        uploadedBy: true 
      });
      
      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const updateData: any = { ...validation.data };
      if (updateData.expiryDate) {
        updateData.expiryDate = new Date(updateData.expiryDate);
      }

      const updatedDoc = await storage.updateComplianceDocument(docId, updateData);
      res.json(updatedDoc);
    } catch (error) {
      console.error("Error updating compliance document:", error);
      res.status(500).json({ message: "Failed to update compliance document" });
    }
  });

  // ==================== MAINTENANCE ROUTES ====================
  
  // AI analyze maintenance image for fix suggestions
  app.post("/api/maintenance/analyze-image", isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body
      const validation = analyzeMaintenanceImageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { imageUrl, issueDescription } = validation.data;

      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User must belong to an organization" });
      }

      // Check if organization has credits
      const organization = await storage.getOrganization(user.organizationId);
      const currentCredits = organization?.creditsRemaining ?? 0;
      if (!organization || currentCredits < 1) {
        return res.status(402).json({ 
          message: "Insufficient credits. Please purchase more credits to use AI analysis.",
          creditsRemaining: currentCredits
        });
      }

      // Call OpenAI Vision API for maintenance issue analysis
      const openaiInstance = getOpenAI();
      const prompt = issueDescription 
        ? `You are a maintenance expert analyzing a property maintenance issue. The tenant reports: "${issueDescription}". 
           Analyze the image and provide:
           1. A brief assessment of the issue (2-3 sentences)
           2. 3-5 possible DIY fixes the tenant can try immediately
           3. Whether this requires professional help
           Format your response in clear sections.`
        : `You are a maintenance expert analyzing a property maintenance issue. 
           Analyze the image and provide:
           1. A brief assessment of what maintenance issue you can see (2-3 sentences)
           2. 3-5 possible DIY fixes that can be tried immediately
           3. Whether this requires professional help
           Format your response in clear sections.`;

      const response = await openaiInstance.responses.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        input: [
          {
            role: "user",
            content: normalizeApiContent([
              { type: "text", text: prompt },
              { type: "image_url", image_url: imageUrl }
            ])
          }
        ],
        max_output_tokens: 800,
      });

      const suggestedFixes = response.output_text || (response.output?.[0] as any)?.content?.[0]?.text || "Unable to analyze the image at this time.";

      // Deduct credit
      await storage.deductCredit(user.organizationId, 1, "AI maintenance image analysis");

      res.json({ 
        suggestedFixes,
        analysis: {
          model: "gpt-5",
          timestamp: new Date().toISOString()
        },
        creditsRemaining: currentCredits - 1
      });
    } catch (error) {
      console.error("Error analyzing maintenance image:", error);
      res.status(500).json({ message: "Failed to analyze image" });
    }
  });
  
  app.post("/api/maintenance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Get user to check organization
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate request body
      const validation = insertMaintenanceRequestSchema.omit({ organizationId: true, reportedBy: true }).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { propertyId, title, description, priority, photoUrls, aiSuggestedFixes, aiAnalysisJson, inspectionId, inspectionEntryId, source } = validation.data;

      // Verify property exists and belongs to the same organization
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      if (property.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied: Property belongs to a different organization" });
      }

      const request = await storage.createMaintenanceRequest({
        organizationId: user.organizationId,
        propertyId,
        reportedBy: userId,
        title,
        description: description || null,
        priority: priority || "medium",
        photoUrls: photoUrls || null,
        aiSuggestedFixes: aiSuggestedFixes || null,
        aiAnalysisJson: aiAnalysisJson || null,
        source: source || (user.role === "tenant" ? "tenant_portal" : "manual"),
        inspectionId: inspectionId || null,
        inspectionEntryId: inspectionEntryId || null,
      });

      res.json(request);
    } catch (error) {
      console.error("Error creating maintenance request:", error);
      res.status(500).json({ message: "Failed to create maintenance request" });
    }
  });

  // Quick-add maintenance request from inspection (with offline support)
  app.post("/api/maintenance/quick", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Get user to check organization
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate request body with quick-add schema
      const validation = quickAddMaintenanceSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      const { propertyId, title, description, priority, photoUrls, inspectionId, inspectionEntryId, source } = validation.data;

      // Verify property exists and belongs to the same organization
      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }
      
      if (property.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied: Property belongs to a different organization" });
      }

      // If inspectionId provided, verify it exists and belongs to the same organization
      if (inspectionId) {
        const inspection = await storage.getInspection(inspectionId);
        if (!inspection) {
          return res.status(404).json({ message: "Inspection not found" });
        }

        // Verify organization via property or block
        let ownerOrgId: string | null = null;
        if (inspection.propertyId) {
          const inspectionProperty = await storage.getProperty(inspection.propertyId);
          ownerOrgId = inspectionProperty?.organizationId || null;
        } else if (inspection.blockId) {
          const block = await storage.getBlock(inspection.blockId);
          ownerOrgId = block?.organizationId || null;
        }

        if (ownerOrgId !== user.organizationId) {
          return res.status(403).json({ message: "Access denied: Inspection does not belong to your organization" });
        }
      }

      const request = await storage.createMaintenanceRequest({
        organizationId: user.organizationId,
        propertyId,
        reportedBy: userId,
        title,
        description: description || null,
        priority: priority || "medium",
        photoUrls: photoUrls || null,
        source: source || "inspection",
        inspectionId: inspectionId || null,
        inspectionEntryId: inspectionEntryId || null,
      });

      res.json(request);
    } catch (error) {
      console.error("Error creating quick-add maintenance request:", error);
      res.status(500).json({ message: "Failed to create maintenance request" });
    }
  });

  app.get("/api/maintenance", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const requests = await storage.getMaintenanceByOrganization(user.organizationId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching maintenance requests:", error);
      res.status(500).json({ message: "Failed to fetch maintenance requests" });
    }
  });

  app.patch("/api/maintenance/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // Fetch the maintenance request to verify organization ownership
      const existingRequests = await storage.getMaintenanceByOrganization(user.organizationId);
      const existingRequest = existingRequests.find(r => r.id === id);
      
      if (!existingRequest) {
        return res.status(404).json({ message: "Maintenance request not found" });
      }

      // Verify organization ownership
      if (existingRequest.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Unauthorized to update this request" });
      }

      // Only owners and clerks can edit maintenance requests
      if (user.role !== "owner" && user.role !== "clerk") {
        return res.status(403).json({ message: "Insufficient permissions" });
      }

      // Validate request body
      const validation = updateMaintenanceRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validation.error.errors 
        });
      }

      // Prevent organizationId from being changed
      const { organizationId: _, ...safeUpdates } = validation.data as any;

      // Use the new updateMaintenanceRequest method for full updates
      const request = await storage.updateMaintenanceRequest(id, safeUpdates);
      res.json(request);
    } catch (error) {
      console.error("Error updating maintenance request:", error);
      res.status(500).json({ message: "Failed to update maintenance request" });
    }
  });

  // ==================== CREDIT ROUTES ====================
  
  app.get("/api/credits/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.json([]);
      }

      const transactions = await storage.getCreditTransactions(user.organizationId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching credit transactions:", error);
      res.status(500).json({ message: "Failed to fetch credit transactions" });
    }
  });

  // ==================== STRIPE ROUTES ====================
  
  app.post("/api/stripe/create-checkout", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const organization = await storage.getOrganization(user.organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const { credits } = req.body;
      const amount = credits * 100; // $1 per credit, in cents

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${credits} Inspection Credits`,
                description: "Credits for AI-powered property inspections",
              },
              unit_amount: 100, // $1 per credit
            },
            quantity: credits,
          },
        ],
        mode: "payment",
        success_url: `${req.headers.origin}/dashboard?payment=success`,
        cancel_url: `${req.headers.origin}/dashboard?payment=cancelled`,
        client_reference_id: organization.id,
        metadata: {
          organizationId: organization.id,
          credits: credits.toString(),
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/webhook", async (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    try {
      const stripe = await getUncachableStripeClient();
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig!,
        process.env.STRIPE_WEBHOOK_SECRET || "whsec_test"
      );

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const organizationId = session.metadata.organizationId;
        const credits = parseInt(session.metadata.credits);

        // Add credits to organization
        const organization = await storage.getOrganization(organizationId);
        if (organization) {
          await storage.updateOrganizationCredits(
            organizationId,
            (organization.creditsRemaining ?? 0) + credits
          );

          await storage.createCreditTransaction({
            organizationId,
            amount: credits,
            type: "purchase",
            description: `Purchased ${credits} credits via Stripe`,
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook error:", error);
      res.status(400).send(`Webhook Error`);
    }
  });

  // ==================== BLOCK ROUTES ====================
  
  app.post("/api/blocks", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Validate request body with Zod
      const parseResult = insertBlockSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: parseResult.error.errors 
        });
      }

      const block = await storage.createBlock({
        ...parseResult.data,
        organizationId: user.organizationId,
      });
      res.status(201).json(block);
    } catch (error: any) {
      console.error("Error creating block:", error);
      res.status(500).json({ error: "Failed to create block" });
    }
  });

  app.get("/api/blocks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const blocks = await storage.getBlocksWithStats(user.organizationId);
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching blocks:", error);
      res.status(500).json({ error: "Failed to fetch blocks" });
    }
  });

  app.get("/api/blocks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const block = await storage.getBlock(req.params.id);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }

      // Verify organization ownership
      if (block.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(block);
    } catch (error) {
      console.error("Error fetching block:", error);
      res.status(500).json({ error: "Failed to fetch block" });
    }
  });

  app.get("/api/blocks/:id/properties", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const blockId = req.params.id;
      
      // Verify block belongs to user's organization
      const block = await storage.getBlock(blockId);
      if (!block || block.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Block not found" });
      }

      const properties = await storage.getPropertiesWithStatsByBlock(blockId);
      res.json(properties);
    } catch (error) {
      console.error("Error fetching block properties:", error);
      res.status(500).json({ error: "Failed to fetch block properties" });
    }
  });

  // Get block annual compliance report
  app.get("/api/blocks/:id/compliance-report", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const block = await storage.getBlock(id);
      if (!block || block.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Block not found" });
      }

      // Get all inspections for this block
      const allInspections = await storage.getInspectionsByBlock(id);
      
      // Get all inspection templates
      const templates = await storage.getInspectionTemplatesByOrganization(user.organizationId);
      const activeTemplates = templates.filter(t => t.isActive && (t.scope === 'block' || t.scope === 'both'));
      
      // Build compliance data by template and month
      const currentYear = new Date().getFullYear();
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      const complianceData = activeTemplates.map(template => {
        const templateInspections = allInspections.filter(i => i.templateId === template.id);
        
        const monthData = months.map((monthName, monthIndex) => {
          // Find inspections scheduled for this month
          const monthInspections = templateInspections.filter(inspection => {
            if (!inspection.scheduledDate) return false;
            const schedDate = new Date(inspection.scheduledDate);
            return schedDate.getFullYear() === currentYear && schedDate.getMonth() === monthIndex;
          });
          
          if (monthInspections.length === 0) {
            return { month: monthName, status: 'not_scheduled', count: 0 };
          }
          
          const now = new Date();
          const completedCount = monthInspections.filter(i => i.status === 'completed').length;
          const overdueCount = monthInspections.filter(i => {
            if (i.status === 'completed' || !i.scheduledDate) return false;
            const schedDate = new Date(i.scheduledDate);
            return schedDate < now;
          }).length;
          
          const dueCount = monthInspections.filter(i => {
            if (i.status === 'completed' || !i.scheduledDate) return false;
            const schedDate = new Date(i.scheduledDate);
            const daysUntil = Math.ceil((schedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return daysUntil >= 0 && daysUntil <= 30;
          }).length;
          
          let status = 'not_scheduled';
          if (overdueCount > 0) {
            status = 'overdue';
          } else if (completedCount === monthInspections.length) {
            status = 'completed';
          } else if (dueCount > 0) {
            status = 'due';
          } else {
            status = 'scheduled';
          }
          
          return {
            month: monthName,
            status,
            count: monthInspections.length,
            completed: completedCount,
            overdue: overdueCount,
          };
        });
        
        // Calculate compliance percentage for this template
        const totalScheduled = monthData.reduce((sum, m) => sum + m.count, 0);
        const totalCompleted = monthData.reduce((sum, m) => sum + (m.completed || 0), 0);
        const complianceRate = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
        
        return {
          templateId: template.id,
          templateName: template.name,
          monthData,
          complianceRate,
          totalScheduled,
          totalCompleted,
        };
      });
      
      // Calculate overall compliance
      const totalScheduled = complianceData.reduce((sum, t) => sum + t.totalScheduled, 0);
      const totalCompleted = complianceData.reduce((sum, t) => sum + t.totalCompleted, 0);
      const overallCompliance = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 100;
      
      res.json({
        year: currentYear,
        months,
        templates: complianceData,
        overallCompliance,
        totalScheduled,
        totalCompleted,
      });
    } catch (error) {
      console.error("Error fetching block compliance report:", error);
      res.status(500).json({ message: "Failed to fetch compliance report" });
    }
  });

  app.patch("/api/blocks/:id", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getBlock(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Validate request body (partial update) with Zod
      const parseResult = insertBlockSchema.partial().safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: parseResult.error.errors 
        });
      }

      const block = await storage.updateBlock(req.params.id, parseResult.data);
      res.json(block);
    } catch (error: any) {
      console.error("Error updating block:", error);
      res.status(500).json({ error: "Failed to update block" });
    }
  });

  app.delete("/api/blocks/:id", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getBlock(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteBlock(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting block:", error);
      res.status(500).json({ error: "Failed to delete block" });
    }
  });

  // Get tenant information for a block
  app.get("/api/blocks/:blockId/tenants", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const { blockId } = req.params;

      // Verify block belongs to user's organization
      const block = await storage.getBlock(blockId);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (block.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get stats and tenant assignments
      const stats = await storage.getBlockTenantStats(blockId);
      const tenants = await storage.getTenantAssignmentsByBlock(blockId);

      res.json({
        stats,
        tenants,
      });
    } catch (error) {
      console.error("Error fetching block tenants:", error);
      res.status(500).json({ error: "Failed to fetch block tenants" });
    }
  });

  // Broadcast message to all block tenants
  app.post("/api/blocks/:blockId/broadcast", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const { blockId } = req.params;
      const { templateId, subject, body } = req.body;

      // Verify block belongs to user's organization
      const block = await storage.getBlock(blockId);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (block.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get organization for name
      const organization = await storage.getOrganization(user.organizationId);

      // Prepare message template
      let templateData: { subject: string; body: string };
      
      if (templateId) {
        // Use existing template
        const template = await storage.getMessageTemplate(templateId);
        if (!template || template.organizationId !== user.organizationId) {
          return res.status(404).json({ error: "Template not found" });
        }
        templateData = { subject: template.subject, body: template.body };
      } else if (subject && body) {
        // Use custom message
        templateData = { subject, body };
      } else {
        return res.status(400).json({ error: "Either templateId or subject and body must be provided" });
      }

      // Get all tenant emails for this block
      const recipients = await storage.getBlockTenantsEmails(blockId, user.organizationId);

      if (recipients.length === 0) {
        return res.status(404).json({ error: "No active tenants found for this block" });
      }

      // Send broadcast
      const { broadcastMessageToTenants } = await import('./resend');
      const result = await broadcastMessageToTenants(
        recipients,
        templateData,
        {
          blockName: block.name,
          organizationName: organization?.name || 'Your Property Management',
        }
      );

      res.json(result);
    } catch (error) {
      console.error("Error broadcasting message:", error);
      res.status(500).json({ error: "Failed to broadcast message" });
    }
  });

  // ==================== MESSAGE TEMPLATE ROUTES ====================

  app.get("/api/message-templates", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const templates = await storage.getMessageTemplatesByOrganization(user.organizationId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching message templates:", error);
      res.status(500).json({ error: "Failed to fetch message templates" });
    }
  });

  app.post("/api/message-templates", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertMessageTemplateSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ error: "Invalid request data", details: validatedData.error.errors });
      }

      const template = await storage.createMessageTemplate({
        ...validatedData.data,
        organizationId: user.organizationId,
        createdBy: userId,
      });

      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating message template:", error);
      res.status(500).json({ error: "Failed to create message template" });
    }
  });

  app.put("/api/message-templates/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const existing = await storage.getMessageTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Template not found" });
      }

      const validatedData = updateMessageTemplateSchema.safeParse(req.body);
      if (!validatedData.success) {
        return res.status(400).json({ error: "Invalid request data", details: validatedData.error.errors });
      }

      const updated = await storage.updateMessageTemplate(req.params.id, validatedData.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating message template:", error);
      res.status(500).json({ error: "Failed to update message template" });
    }
  });

  app.delete("/api/message-templates/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const existing = await storage.getMessageTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Template not found" });
      }

      await storage.deleteMessageTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting message template:", error);
      res.status(500).json({ error: "Failed to delete message template" });
    }
  });

  // ==================== TENANT ASSIGNMENT ROUTES ====================

  app.post("/api/tenant-assignments", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Transform request body to match schema expectations
      // Dates come as ISO strings but Zod expects Date objects
      // Numeric fields come as numbers but Drizzle expects strings
      const transformedBody: any = {
        ...req.body,
      };
      
      // Convert date strings to Date objects
      if (req.body.leaseStartDate && typeof req.body.leaseStartDate === 'string') {
        transformedBody.leaseStartDate = new Date(req.body.leaseStartDate);
      }
      if (req.body.leaseEndDate && typeof req.body.leaseEndDate === 'string') {
        transformedBody.leaseEndDate = new Date(req.body.leaseEndDate);
      }
      
      // Convert numeric fields to strings (Drizzle numeric fields expect strings)
      if (req.body.monthlyRent !== undefined && req.body.monthlyRent !== null) {
        transformedBody.monthlyRent = String(req.body.monthlyRent);
      }
      if (req.body.depositAmount !== undefined && req.body.depositAmount !== null) {
        transformedBody.depositAmount = String(req.body.depositAmount);
      }
      
      const validatedData = insertTenantAssignmentSchema.safeParse(transformedBody);
      if (!validatedData.success) {
        console.error("[Tenant Assignment] Validation errors:", validatedData.error.errors);
        console.error("[Tenant Assignment] Request body:", req.body);
        console.error("[Tenant Assignment] Transformed body:", transformedBody);
        return res.status(400).json({ 
          error: "Invalid request data", 
          message: validatedData.error.errors[0]?.message || "Validation failed",
          details: validatedData.error.errors 
        });
      }

      // Verify property belongs to user's organization
      const property = await storage.getProperty(validatedData.data.propertyId);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Property not found" });
      }

      // Verify tenant user exists and has tenant role
      const tenantUser = await storage.getUser(validatedData.data.tenantId);
      if (!tenantUser || tenantUser.role !== 'tenant' || tenantUser.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant user not found" });
      }

      // Store original password if provided (for later retrieval when sending password)
      // This ensures we can send the EXACT password entered during tenant creation
      let assignmentData = { ...validatedData.data };
      if (req.body.originalPassword && typeof req.body.originalPassword === 'string') {
        // Store original password in notes field as JSON
        // If notes already exists and is not JSON, preserve it as a text note
        // Format: { "_originalPassword": "password123", "_userNotes": "existing notes text" }
        try {
          let notesObj: any = {};
          if (assignmentData.notes) {
            try {
              // Try to parse as JSON first
              notesObj = JSON.parse(assignmentData.notes);
            } catch {
              // If not JSON, preserve as user notes
              notesObj._userNotes = assignmentData.notes;
            }
          }
          // Store the exact password entered during tenant creation
          notesObj._originalPassword = req.body.originalPassword;
          assignmentData.notes = JSON.stringify(notesObj);
          console.log(`[Create Tenant Assignment] Stored original password for tenant assignment`);
        } catch (error) {
          // Fallback: create new JSON object
          console.error(`[Create Tenant Assignment] Error storing original password:`, error);
          assignmentData.notes = JSON.stringify({ _originalPassword: req.body.originalPassword });
        }
      } else {
        console.warn(`[Create Tenant Assignment] No original password provided - password will not be retrievable for sending`);
      }

      const assignment = await storage.createTenantAssignment({
        ...assignmentData,
        organizationId: user.organizationId,
      });

      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating tenant assignment:", error);
      res.status(500).json({ error: "Failed to create tenant assignment" });
    }
  });

  app.put("/api/tenant-assignments/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify assignment belongs to user's organization
      const existing = await storage.getTenantAssignment(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant assignment not found" });
      }

      // Transform request body before validation (same as POST endpoint)
      const transformedBody = { ...req.body };

      // Convert date strings or Date objects to Date objects for Zod validation
      if (req.body.leaseStartDate !== undefined && req.body.leaseStartDate !== null) {
        if (typeof req.body.leaseStartDate === 'string') {
          transformedBody.leaseStartDate = new Date(req.body.leaseStartDate);
        } else if (req.body.leaseStartDate instanceof Date) {
          transformedBody.leaseStartDate = req.body.leaseStartDate;
        }
      }
      if (req.body.leaseEndDate !== undefined && req.body.leaseEndDate !== null) {
        if (typeof req.body.leaseEndDate === 'string') {
          transformedBody.leaseEndDate = new Date(req.body.leaseEndDate);
        } else if (req.body.leaseEndDate instanceof Date) {
          transformedBody.leaseEndDate = req.body.leaseEndDate;
        }
      }

      // Convert numeric fields to strings (Drizzle numeric fields expect strings)
      if (req.body.monthlyRent !== undefined && req.body.monthlyRent !== null) {
        transformedBody.monthlyRent = String(req.body.monthlyRent);
      }
      if (req.body.depositAmount !== undefined && req.body.depositAmount !== null) {
        transformedBody.depositAmount = String(req.body.depositAmount);
      }

      const validatedData = updateTenantAssignmentSchema.safeParse(transformedBody);
      if (!validatedData.success) {
        console.error("[Tenant Assignment Update] Validation errors:", validatedData.error.errors);
        console.error("[Tenant Assignment Update] Request body:", req.body);
        console.error("[Tenant Assignment Update] Transformed body:", transformedBody);
        return res.status(400).json({ 
          error: "Invalid request data", 
          message: validatedData.error.errors[0]?.message || "Validation failed",
          details: validatedData.error.errors 
        });
      }

      // Preserve original password from existing assignment when updating notes
      let updateData = { ...validatedData.data };
      if (updateData.notes !== undefined && existing.notes) {
        try {
          const existingNotesData = JSON.parse(existing.notes);
          if (existingNotesData._originalPassword) {
            // Preserve the original password
            try {
              const newNotesData = typeof updateData.notes === 'string' ? JSON.parse(updateData.notes) : updateData.notes;
              if (typeof newNotesData === 'object' && newNotesData !== null) {
                newNotesData._originalPassword = existingNotesData._originalPassword;
                updateData.notes = JSON.stringify(newNotesData);
              } else {
                // If new notes is not JSON, preserve it as user notes
                const notesObj: any = { _userNotes: updateData.notes };
                notesObj._originalPassword = existingNotesData._originalPassword;
                updateData.notes = JSON.stringify(notesObj);
              }
            } catch {
              // If new notes is not JSON, preserve it as user notes
              const notesObj: any = { _userNotes: updateData.notes };
              notesObj._originalPassword = existingNotesData._originalPassword;
              updateData.notes = JSON.stringify(notesObj);
            }
          }
        } catch {
          // Existing notes is not JSON, preserve original password if it exists
          // (This shouldn't happen, but handle gracefully)
        }
      }

      const updated = await storage.updateTenantAssignment(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating tenant assignment:", error);
      res.status(500).json({ error: "Failed to update tenant assignment" });
    }
  });

  app.delete("/api/tenant-assignments/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify assignment belongs to user's organization
      const existing = await storage.getTenantAssignment(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant assignment not found" });
      }

      await storage.deleteTenantAssignment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tenant assignment:", error);
      res.status(500).json({ error: "Failed to delete tenant assignment" });
    }
  });

  // Get tags for a tenant assignment
  app.get("/api/tenant-assignments/:id/tags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify assignment belongs to user's organization
      const assignment = await storage.getTenantAssignment(req.params.id);
      if (!assignment || assignment.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant assignment not found" });
      }

      const tags = await storage.getTenantAssignmentTags(req.params.id, user.organizationId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tenant assignment tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // Update tags for a tenant assignment
  app.put("/api/tenant-assignments/:id/tags", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify assignment belongs to user's organization
      const assignment = await storage.getTenantAssignment(req.params.id);
      if (!assignment || assignment.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant assignment not found" });
      }

      const { tagIds } = req.body;
      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ error: "tagIds must be an array" });
      }

      await storage.updateTenantAssignmentTags(req.params.id, tagIds, user.organizationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating tenant assignment tags:", error);
      res.status(500).json({ error: "Failed to update tags" });
    }
  });

  // Send portal credentials to tenant
  app.post("/api/tenant-assignments/:id/send-password", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify assignment belongs to user's organization
      const assignment = await storage.getTenantAssignment(req.params.id);
      if (!assignment || assignment.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant assignment not found" });
      }

      // Get tenant user details
      const tenant = await storage.getUser(assignment.tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant user not found" });
      }

      // Validate tenant has an email address
      if (!tenant.email || !tenant.email.trim()) {
        return res.status(400).json({ error: "Tenant user does not have an email address configured" });
      }

      // Use provided password, retrieve from stored original password, or generate a new one
      let passwordToSend: string;
      if (req.body.password && typeof req.body.password === 'string' && req.body.password.trim() !== '') {
        // Use the provided password (e.g., when creating a new tenant)
        passwordToSend = req.body.password;
        const { hashPassword } = await import('./auth');
        const hashedPassword = await hashPassword(passwordToSend);
        
        // Update tenant password with the provided password
        await storage.upsertUser({
          ...tenant,
          password: hashedPassword,
        });
      } else {
        // Try to retrieve original password from assignment notes
        let originalPassword: string | null = null;
        if (assignment.notes) {
          try {
            const notesData = JSON.parse(assignment.notes);
            if (notesData._originalPassword && typeof notesData._originalPassword === 'string') {
              originalPassword = notesData._originalPassword;
            }
          } catch {
            // Notes is not JSON, ignore
          }
        }

        if (originalPassword) {
          // Use the stored original password (the exact password entered during tenant creation)
          passwordToSend = originalPassword;
          const { hashPassword } = await import('./auth');
          const hashedPassword = await hashPassword(passwordToSend);
          
          // Update tenant password with the original password (in case it was changed)
          await storage.upsertUser({
            ...tenant,
            password: hashedPassword,
          });
          console.log(`[Send Password] Using stored original password for tenant ${tenant.email}`);
        } else {
          // No stored original password found - this should not happen for newly created tenants
          // For tenants created before this feature, we cannot retrieve the original password
          // In this case, we must generate a new password and inform the user
          console.warn(`[Send Password] No stored original password found for tenant ${tenant.email}, generating new password`);
          passwordToSend = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10).toUpperCase();
          const { hashPassword } = await import('./auth');
          const hashedPassword = await hashPassword(passwordToSend);

          // Update tenant password with the new generated password
          await storage.upsertUser({
            ...tenant,
            password: hashedPassword,
          });
          
          // Note: The email will be sent with the new password, but this is not ideal
          // Ideally, all tenants should have their original password stored
        }
      }

      // Send email with credentials using the proper helper function
      const fullName = [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") || tenant.email;
      
      // Validate email and password before sending
      if (!tenant.email || !tenant.email.trim()) {
        return res.status(400).json({ 
          error: "Cannot send email: Tenant does not have a valid email address",
          emailSent: false
        });
      }
      
      if (!passwordToSend || !passwordToSend.trim()) {
        return res.status(400).json({ 
          error: "Cannot send email: No password available to send",
          emailSent: false
        });
      }
      
      console.log(`[Send Password] Sending credentials email to ${tenant.email} with password length: ${passwordToSend.length}`);
      
      let emailSent = false;
      try {
        const { sendTenantCredentialsEmail } = await import('./resend');
        await sendTenantCredentialsEmail(
          tenant.email.trim(),
          fullName,
          passwordToSend
        );
        emailSent = true;
        console.log(`[Send Password] Successfully sent credentials email to ${tenant.email}`);
      } catch (emailError) {
        console.error('Failed to send tenant credentials email:', emailError);
        // Return error but don't fail the entire request - password was already updated
        return res.status(500).json({ 
          error: "Failed to send email. Password was updated but email could not be sent.",
          emailSent: false,
          details: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }

      res.json({ 
        success: true, 
        message: "Credentials sent successfully",
        emailSent: true
      });
    } catch (error) {
      console.error("Error sending tenant password:", error);
      res.status(500).json({ 
        error: "Failed to send credentials",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get attachments for a tenant assignment
  app.get("/api/tenant-assignments/:id/attachments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify assignment belongs to user's organization
      const assignment = await storage.getTenantAssignment(req.params.id);
      if (!assignment || assignment.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant assignment not found" });
      }

      const attachments = await storage.getTenancyAttachments(req.params.id, user.organizationId);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching tenancy attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  // Upload tenancy attachment
  app.post("/api/tenancy-attachments", isAuthenticated, requireRole("owner", "clerk"), upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const { tenantAssignmentId } = req.body;
      if (!tenantAssignmentId) {
        return res.status(400).json({ error: "tenantAssignmentId is required" });
      }

      // Verify assignment belongs to user's organization
      const assignment = await storage.getTenantAssignment(tenantAssignmentId);
      if (!assignment || assignment.organizationId !== user.organizationId) {
        return res.status(404).json({ error: "Tenant assignment not found" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Upload to local storage using ObjectStorageService
      const objectStorageService = new ObjectStorageService();
      const objectId = randomUUID();
      const normalizedPath = await objectStorageService.saveUploadedFile(
        objectId,
        req.file.buffer,
        req.file.mimetype
      );

      // Convert relative path to absolute URL
      const baseUrl = getBaseUrl(req);
      const fileUrl = `${baseUrl}${normalizedPath}`;

      // Set ACL to public so it can be accessed
      try {
        await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
          owner: userId,
          visibility: "public",
        });
      } catch (error) {
        console.warn("Failed to set ACL for tenancy attachment:", error);
      }

      // Create attachment record
      const attachment = await storage.createTenancyAttachment({
        tenantAssignmentId,
        fileName: req.file.originalname,
        fileUrl: normalizedPath, // Store relative path, convert to absolute when serving
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: userId,
        organizationId: user.organizationId,
      });

      res.status(201).json({
        ...attachment,
        fileUrl: fileUrl, // Return absolute URL in response
      });
    } catch (error) {
      console.error("Error uploading tenancy attachment:", error);
      res.status(500).json({ error: "Failed to upload attachment" });
    }
  });

  // Delete tenancy attachment
  app.delete("/api/tenancy-attachments/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify attachment belongs to user's organization, get fileUrl, and delete database record
      let result: { fileUrl: string } | null = null;
      try {
        result = await storage.deleteTenancyAttachment(req.params.id, user.organizationId);
      } catch (storageError: any) {
        console.error("Error deleting tenancy attachment from database:", storageError);
        if (storageError.message === "Attachment not found or access denied") {
          return res.status(404).json({ error: storageError.message });
        }
        throw storageError;
      }
      
      // Delete the file from object storage (don't fail if file deletion fails)
      if (result?.fileUrl) {
        try {
          const objectStorageService = new ObjectStorageService();
          await objectStorageService.deleteObjectEntity(result.fileUrl);
        } catch (fileError) {
          // Log but don't fail - database record is already deleted
          console.warn("Failed to delete file from storage (database record already deleted):", fileError);
        }
      }
      
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting tenancy attachment:", error);
      res.status(500).json({ 
        error: "Failed to delete attachment",
        message: error?.message || "An error occurred while deleting the attachment"
      });
    }
  });

  // ==================== ASSET INVENTORY ROUTES ====================

  app.post("/api/asset-inventory", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertAssetInventorySchema.parse(req.body);

      const asset = await storage.createAssetInventory({
        ...validatedData,
        organizationId: user.organizationId,
      });
      res.status(201).json(asset);
    } catch (error: any) {
      console.error("Error creating asset inventory:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create asset inventory" });
    }
  });

  // Quick-add asset from inspection (with offline support)
  app.post("/api/asset-inventory/quick", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Validate request body with quick-add schema
      const validation = quickAddAssetSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: validation.error.errors 
        });
      }

      const { name, category, condition, cleanliness, location, description, propertyId, blockId, photos, inspectionId, inspectionEntryId } = validation.data;

      // Verify property or block exists and belongs to the same organization
      if (propertyId) {
        const property = await storage.getProperty(propertyId);
        if (!property) {
          return res.status(404).json({ error: "Property not found" });
        }
        if (property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied: Property belongs to a different organization" });
        }
      }

      if (blockId) {
        const block = await storage.getBlock(blockId);
        if (!block) {
          return res.status(404).json({ error: "Block not found" });
        }
        if (block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied: Block belongs to a different organization" });
        }
      }

      // If inspectionId provided, verify it exists and belongs to the same organization
      if (inspectionId) {
        const inspection = await storage.getInspection(inspectionId);
        if (!inspection) {
          return res.status(404).json({ error: "Inspection not found" });
        }

        // Verify organization via property or block
        let ownerOrgId: string | null = null;
        if (inspection.propertyId) {
          const inspectionProperty = await storage.getProperty(inspection.propertyId);
          ownerOrgId = inspectionProperty?.organizationId || null;
        } else if (inspection.blockId) {
          const inspectionBlock = await storage.getBlock(inspection.blockId);
          ownerOrgId = inspectionBlock?.organizationId || null;
        }

        if (ownerOrgId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied: Inspection does not belong to your organization" });
        }
      }

      const asset = await storage.createAssetInventory({
        organizationId: user.organizationId,
        name,
        category: category || null,
        condition,
        cleanliness: cleanliness || null,
        location: location || null,
        description: description || null,
        propertyId: propertyId || null,
        blockId: blockId || null,
        photos: photos || null,
        inspectionId: inspectionId || null,
        inspectionEntryId: inspectionEntryId || null,
      });

      res.status(201).json(asset);
    } catch (error: any) {
      console.error("Error creating quick-add asset:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  // Quick-update asset from inspection (with offline support)
  app.patch("/api/asset-inventory/:id/quick", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const { id } = req.params;

      // Verify asset exists and belongs to user's organization
      const existingAsset = await storage.getAssetInventory(id);
      if (!existingAsset) {
        return res.status(404).json({ error: "Asset not found" });
      }
      if (existingAsset.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied: Asset belongs to a different organization" });
      }

      // Validate request body with quick-update schema
      const validation = quickUpdateAssetSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: validation.error.errors 
        });
      }

      const { condition, cleanliness, location, notes, photos, inspectionId, inspectionEntryId, offlineId } = validation.data;

      // Check for duplicate offline requests (deduplication)
      if (offlineId) {
        // In a production system, you'd store processed offlineIds in a cache/db
        // For now, we'll just log and continue (idempotent operation)
        console.log(`Processing offline update with ID: ${offlineId}`);
      }

      // If inspectionId provided, verify it exists and belongs to the same organization
      if (inspectionId) {
        const inspection = await storage.getInspection(inspectionId);
        if (!inspection) {
          return res.status(404).json({ error: "Inspection not found" });
        }

        // Verify organization via property or block
        let ownerOrgId: string | null = null;
        if (inspection.propertyId) {
          const inspectionProperty = await storage.getProperty(inspection.propertyId);
          ownerOrgId = inspectionProperty?.organizationId || null;
        } else if (inspection.blockId) {
          const inspectionBlock = await storage.getBlock(inspection.blockId);
          ownerOrgId = inspectionBlock?.organizationId || null;
        }

        if (ownerOrgId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied: Inspection does not belong to your organization" });
        }
      }

      // Build update object with only provided fields
      // Map notes to description for consistency with asset table schema
      const updateData: any = {};
      if (condition !== undefined) updateData.condition = condition;
      if (cleanliness !== undefined) updateData.cleanliness = cleanliness;
      if (location !== undefined) updateData.location = location;
      if (notes !== undefined) updateData.description = notes; // Map notes -> description
      if (photos !== undefined) updateData.photos = photos;
      if (inspectionId !== undefined) updateData.inspectionId = inspectionId;
      if (inspectionEntryId !== undefined) updateData.inspectionEntryId = inspectionEntryId;

      const updatedAsset = await storage.updateAssetInventory(id, updateData);

      res.json(updatedAsset);
    } catch (error: any) {
      console.error("Error updating quick-update asset:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  app.get("/api/asset-inventory", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const { propertyId, blockId } = req.query;

      // If propertyId is provided, filter by property
      if (propertyId) {
        const property = await storage.getProperty(propertyId);
        if (!property) {
          return res.status(404).json({ error: "Property not found" });
        }
        if (property.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
        const assets = await storage.getAssetInventoryByProperty(propertyId);
        return res.json(assets);
      }

      // If blockId is provided, filter by block
      if (blockId) {
        const block = await storage.getBlock(blockId);
        if (!block) {
          return res.status(404).json({ error: "Block not found" });
        }
        if (block.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Access denied" });
        }
        const assets = await storage.getAssetInventoryByBlock(blockId);
        return res.json(assets);
      }

      // Otherwise return all assets for the organization
      const assets = await storage.getAssetInventoryByOrganization(user.organizationId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch asset inventory" });
    }
  });

  app.get("/api/asset-inventory/property/:propertyId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify property belongs to user's organization
      const property = await storage.getProperty(req.params.propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (property.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const assets = await storage.getAssetInventoryByProperty(req.params.propertyId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching property asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch property asset inventory" });
    }
  });

  app.get("/api/asset-inventory/block/:blockId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify block belongs to user's organization
      const block = await storage.getBlock(req.params.blockId);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }
      if (block.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const assets = await storage.getAssetInventoryByBlock(req.params.blockId);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching block asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch block asset inventory" });
    }
  });

  app.get("/api/asset-inventory/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const asset = await storage.getAssetInventory(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      // Verify organization ownership
      if (asset.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(asset);
    } catch (error) {
      console.error("Error fetching asset inventory:", error);
      res.status(500).json({ error: "Failed to fetch asset inventory" });
    }
  });

  app.patch("/api/asset-inventory/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getAssetInventory(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Asset not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Remove organizationId from request body (should not be updated)
      const { organizationId: _, ...updateData } = req.body;

      // Validate and coerce dates
      const validatedData = insertAssetInventorySchema.partial().parse(updateData);

      const asset = await storage.updateAssetInventory(req.params.id, validatedData);
      res.json(asset);
    } catch (error: any) {
      console.error("Error updating asset inventory:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update asset inventory" });
    }
  });

  app.delete("/api/asset-inventory/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify organization ownership
      const existing = await storage.getAssetInventory(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Asset not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteAssetInventory(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting asset inventory:", error);
      res.status(500).json({ error: "Failed to delete asset inventory" });
    }
  });

  // ==================== INVENTORY TEMPLATE ROUTES ====================
  
  app.post("/api/inventory-templates", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertInventoryTemplateSchema.parse(req.body);

      const template = await storage.createInventoryTemplate({
        ...validatedData,
        organizationId: user.organizationId,
      });
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating inventory template:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create inventory template" });
    }
  });

  app.get("/api/inventory-templates", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const templates = await storage.getInventoryTemplatesByOrganization(user.organizationId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching inventory templates:", error);
      res.status(500).json({ error: "Failed to fetch inventory templates" });
    }
  });

  app.get("/api/inventory-templates/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const template = await storage.getInventoryTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      if (template.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(template);
    } catch (error) {
      console.error("Error fetching inventory template:", error);
      res.status(500).json({ error: "Failed to fetch inventory template" });
    }
  });

  app.patch("/api/inventory-templates/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const existing = await storage.getInventoryTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validatedData = insertInventoryTemplateSchema.partial().parse(req.body);

      const template = await storage.updateInventoryTemplate(req.params.id, validatedData);
      res.json(template);
    } catch (error: any) {
      console.error("Error updating inventory template:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update inventory template" });
    }
  });

  app.delete("/api/inventory-templates/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const existing = await storage.getInventoryTemplate(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }
      if (existing.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteInventoryTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inventory template:", error);
      res.status(500).json({ error: "Failed to delete inventory template" });
    }
  });

  // ==================== INVENTORY ROUTES ====================
  
  app.post("/api/inventories", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertInventorySchema.parse(req.body);

      const inventory = await storage.createInventory({
        ...validatedData,
        organizationId: user.organizationId,
      });
      res.status(201).json(inventory);
    } catch (error: any) {
      console.error("Error creating inventory:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create inventory" });
    }
  });

  app.get("/api/properties/:propertyId/inventories", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify property belongs to user's organization
      const property = await storage.getProperty(req.params.propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (property.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const inventories = await storage.getInventoriesByProperty(req.params.propertyId);
      res.json(inventories);
    } catch (error) {
      console.error("Error fetching inventories:", error);
      res.status(500).json({ error: "Failed to fetch inventories" });
    }
  });

  app.get("/api/inventories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const inventory = await storage.getInventory(req.params.id);
      if (!inventory) {
        return res.status(404).json({ error: "Inventory not found" });
      }

      if (inventory.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(inventory);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  });

  // ==================== INVENTORY ITEM ROUTES ====================
  
  app.post("/api/inventory-items", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertInventoryItemSchema.parse(req.body);

      // Verify parent inventory belongs to user's organization
      const inventory = await storage.getInventory(validatedData.inventoryId);
      if (!inventory || inventory.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const item = await storage.createInventoryItem(validatedData);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Error creating inventory item:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create inventory item" });
    }
  });

  app.get("/api/inventories/:inventoryId/items", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify inventory belongs to user's organization
      const inventory = await storage.getInventory(req.params.inventoryId);
      if (!inventory || inventory.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const items = await storage.getInventoryItems(req.params.inventoryId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory items:", error);
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  });

  app.patch("/api/inventory-items/:id", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Note: This requires fetching the item first to verify access via parent inventory
      // For efficiency, we could add a getInventoryItem method to storage
      const validatedData = insertInventoryItemSchema.partial().parse(req.body);

      const item = await storage.updateInventoryItem(req.params.id, validatedData);
      res.json(item);
    } catch (error: any) {
      console.error("Error updating inventory item:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update inventory item" });
    }
  });

  // ==================== WORK ORDER ROUTES ====================
  
  app.post("/api/work-orders", isAuthenticated, requireRole("owner", "contractor"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertWorkOrderSchema.parse(req.body);

      // Security: Validate teamId belongs to organization if provided
      if (validatedData.teamId) {
        const team = await storage.getTeam(validatedData.teamId);
        if (!team || team.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Team not found or access denied" });
        }
      }

      // Security: Validate contractorId belongs to organization if provided
      if (validatedData.contractorId) {
        const contractor = await storage.getUser(validatedData.contractorId);
        if (!contractor || contractor.organizationId !== user.organizationId) {
          return res.status(403).json({ error: "Contractor not found or access denied" });
        }
      }

      const workOrder = await storage.createWorkOrder({
        ...validatedData,
        organizationId: user.organizationId,
      });

      // Send email notification to team if teamId is provided (best-effort, non-blocking)
      if (validatedData.teamId) {
        try {
          const team = await storage.getTeam(validatedData.teamId);
          const maintenanceRequest = await db
            .select()
            .from(maintenanceRequests)
            .where(eq(maintenanceRequests.id, validatedData.maintenanceRequestId))
            .limit(1)
            .then(rows => rows[0]);
          
          if (team?.email && maintenanceRequest) {
            // Fetch property details if available
            let propertyName: string | undefined;
            if (maintenanceRequest.propertyId) {
              const property = await storage.getProperty(maintenanceRequest.propertyId);
              propertyName = property?.name;
            }

            await sendTeamWorkOrderNotification(
              team.email,
              team.name,
              {
                id: workOrder.id,
                maintenanceTitle: maintenanceRequest.title,
                maintenanceDescription: maintenanceRequest.description || undefined,
                priority: maintenanceRequest.priority,
                propertyName,
                slaDue: validatedData.slaDue ? new Date(validatedData.slaDue) : null,
                costEstimate: validatedData.costEstimate || null,
              }
            );
            console.log(`Team notification email sent successfully for work order ${workOrder.id} to team ${team.name} (${team.email})`);
          }
        } catch (emailError) {
          // Log email failures but don't block work order creation
          console.error(`Failed to send team notification email for work order ${workOrder.id}:`, emailError);
          console.error(`Email error details:`, {
            workOrderId: workOrder.id,
            teamId: validatedData.teamId,
            error: emailError instanceof Error ? emailError.message : 'Unknown error',
          });
        }
      }

      // Send email notification to contractor if contractorId is provided (best-effort, non-blocking)
      if (validatedData.contractorId) {
        try {
          const contractor = await storage.getUser(validatedData.contractorId);
          const maintenanceRequest = await db
            .select()
            .from(maintenanceRequests)
            .where(eq(maintenanceRequests.id, validatedData.maintenanceRequestId))
            .limit(1)
            .then(rows => rows[0]);
          
          if (contractor?.email && maintenanceRequest) {
            // Fetch property details if available
            let propertyName: string | undefined;
            if (maintenanceRequest.propertyId) {
              const property = await storage.getProperty(maintenanceRequest.propertyId);
              propertyName = property?.name;
            }

            const contractorName = contractor.firstName 
              ? `${contractor.firstName}${contractor.lastName ? ' ' + contractor.lastName : ''}`
              : contractor.username;

            await sendContractorWorkOrderNotification(
              contractor.email,
              contractorName,
              {
                id: workOrder.id,
                maintenanceTitle: maintenanceRequest.title,
                maintenanceDescription: maintenanceRequest.description || undefined,
                priority: maintenanceRequest.priority,
                propertyName,
                slaDue: validatedData.slaDue ? new Date(validatedData.slaDue) : null,
                costEstimate: validatedData.costEstimate || null,
              }
            );
            console.log(`Contractor notification email sent successfully for work order ${workOrder.id} to ${contractorName} (${contractor.email})`);
          }
        } catch (emailError) {
          // Log email failures but don't block work order creation
          console.error(`Failed to send contractor notification email for work order ${workOrder.id}:`, emailError);
          console.error(`Email error details:`, {
            workOrderId: workOrder.id,
            contractorId: validatedData.contractorId,
            error: emailError instanceof Error ? emailError.message : 'Unknown error',
          });
        }
      }

      res.status(201).json(workOrder);
    } catch (error: any) {
      console.error("Error creating work order:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create work order" });
    }
  });

  app.get("/api/work-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // If user is a contractor, show only their work orders
      const workOrders = user.role === "contractor"
        ? await storage.getWorkOrdersByContractor(userId)
        : await storage.getWorkOrdersByOrganization(user.organizationId);
      
      res.json(workOrders);
    } catch (error) {
      console.error("Error fetching work orders:", error);
      res.status(500).json({ error: "Failed to fetch work orders" });
    }
  });

  app.get("/api/work-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access: owner/org members can see all, contractors can only see their assigned orders
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(workOrder);
    } catch (error) {
      console.error("Error fetching work order:", error);
      res.status(500).json({ error: "Failed to fetch work order" });
    }
  });

  app.patch("/api/work-orders/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { status } = req.body;
      const completedAt = status === "completed" ? new Date() : undefined;
      const updated = await storage.updateWorkOrderStatus(req.params.id, status, completedAt);
      res.json(updated);
    } catch (error) {
      console.error("Error updating work order status:", error);
      res.status(500).json({ error: "Failed to update work order status" });
    }
  });

  app.patch("/api/work-orders/:id/cost", isAuthenticated, requireRole("owner", "contractor"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const workOrder = await storage.getWorkOrder(req.params.id);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { costActual, variationNotes } = req.body;
      const updated = await storage.updateWorkOrderCost(req.params.id, costActual, variationNotes);
      res.json(updated);
    } catch (error) {
      console.error("Error updating work order cost:", error);
      res.status(500).json({ error: "Failed to update work order cost" });
    }
  });

  // ==================== WORK LOG ROUTES ====================
  
  app.post("/api/work-logs", isAuthenticated, requireRole("owner", "contractor"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const validatedData = insertWorkLogSchema.parse(req.body);

      // Verify parent work order belongs to user's organization or contractor
      const workOrder = await storage.getWorkOrder(validatedData.workOrderId);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const log = await storage.createWorkLog(validatedData);
      res.status(201).json(log);
    } catch (error: any) {
      console.error("Error creating work log:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid request data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create work log" });
    }
  });

  app.get("/api/work-orders/:workOrderId/logs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Verify work order belongs to user's organization or contractor
      const workOrder = await storage.getWorkOrder(req.params.workOrderId);
      if (!workOrder) {
        return res.status(404).json({ error: "Work order not found" });
      }

      // Verify access
      if (user.role === "contractor") {
        if (workOrder.contractorId !== userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (workOrder.organizationId !== user.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const logs = await storage.getWorkLogs(req.params.workOrderId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching work logs:", error);
      res.status(500).json({ error: "Failed to fetch work logs" });
    }
  });

  // Get work order analytics
  app.get("/api/analytics/work-orders", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Get all work orders for the organization
      const workOrders = await storage.getWorkOrdersByOrganization(user.organizationId);

      // Batch fetch all teams to avoid N+1 queries
      const allTeams = await storage.getTeamsByOrganization(user.organizationId);
      const teamsById = new Map(allTeams.map(t => [t.id, t]));

      // Batch fetch all maintenance requests to avoid N+1 queries
      const maintenanceRequestIds = workOrders.map(wo => wo.maintenanceRequestId);
      const maintenanceRequestsData = await db
        .select()
        .from(maintenanceRequests)
        .where(eq(maintenanceRequests.organizationId, user.organizationId));
      const maintenanceRequestsById = new Map(maintenanceRequestsData.map(mr => [mr.id, mr]));

      // Map work order statuses to UI groupings
      // assigned/waiting_parts → "open", in_progress → "in_progress", completed → "completed", rejected → "rejected"
      const statusDistribution: { [key: string]: number } = {
        open: 0,
        in_progress: 0,
        completed: 0,
        rejected: 0,
      };
      
      for (const wo of workOrders) {
        if (wo.status === "assigned" || wo.status === "waiting_parts") {
          statusDistribution.open++;
        } else if (wo.status === "in_progress") {
          statusDistribution.in_progress++;
        } else if (wo.status === "completed") {
          statusDistribution.completed++;
        } else if (wo.status === "rejected") {
          statusDistribution.rejected++;
        }
      }

      // Calculate priority distribution from linked maintenance requests
      const priorityDistribution: { [key: string]: number } = {};
      for (const wo of workOrders) {
        const mr = maintenanceRequestsById.get(wo.maintenanceRequestId);
        if (mr?.priority) {
          priorityDistribution[mr.priority] = (priorityDistribution[mr.priority] || 0) + 1;
        }
      }

      // Calculate average resolution time for completed work orders
      const completedWorkOrders = workOrders.filter(wo => wo.status === "completed" && wo.completedAt && wo.createdAt);
      const averageResolutionTimeMinutes = completedWorkOrders.length > 0
        ? completedWorkOrders.reduce((sum, wo) => {
            const resolutionTime = wo.completedAt!.getTime() - wo.createdAt!.getTime();
            return sum + (resolutionTime / (1000 * 60)); // Convert to minutes
          }, 0) / completedWorkOrders.length
        : 0;

      // Calculate team distribution
      const teamDistribution: { [key: string]: { name: string; count: number } } = {};
      for (const wo of workOrders) {
        if (wo.teamId) {
          if (!teamDistribution[wo.teamId]) {
            const team = teamsById.get(wo.teamId);
            teamDistribution[wo.teamId] = {
              name: team?.name || 'Unknown Team',
              count: 0
            };
          }
          teamDistribution[wo.teamId].count++;
        }
      }

      // Calculate category distribution from linked maintenance requests
      const categoryDistribution: { [key: string]: number } = {};
      for (const wo of workOrders) {
        const mr = maintenanceRequestsById.get(wo.maintenanceRequestId) as any;
        if (mr?.category) {
          categoryDistribution[mr.category] = (categoryDistribution[mr.category] || 0) + 1;
        }
      }

      res.json({
        total: workOrders.length,
        statusDistribution,
        priorityDistribution,
        teamDistribution,
        categoryDistribution,
        averageResolutionTimeMinutes: Math.round(averageResolutionTimeMinutes),
      });
    } catch (error) {
      console.error("Error fetching work order analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ==================== TAG ROUTES ====================
  
  // Create a new tag
  app.post("/api/tags", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ error: "User not associated with an organization" });
      }

      const validatedData = insertTagSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
      });

      const tag = await storage.createTag(validatedData);
      res.json(tag);
    } catch (error: any) {
      console.error("Error creating tag:", error);
      res.status(400).json({ error: error.message || "Failed to create tag" });
    }
  });

  // Get all tags for the organization
  app.get("/api/tags", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ error: "User not associated with an organization" });
      }

      const tags = await storage.getTagsByOrganization(user.organizationId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // Update a tag
  app.patch("/api/tags/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const tag = await storage.getTag(req.params.id);

      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }

      if (tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateTag(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating tag:", error);
      res.status(500).json({ error: "Failed to update tag" });
    }
  });

  // Delete a tag
  app.delete("/api/tags/:id", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const tag = await storage.getTag(req.params.id);

      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }

      if (tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteTag(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  // Add tag to block
  app.post("/api/blocks/:blockId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const block = await storage.getBlock(req.params.blockId);
      const tag = await storage.getTag(req.params.tagId);

      if (!block || !tag) {
        return res.status(404).json({ error: "Block or tag not found" });
      }

      if (block.organizationId !== user?.organizationId || tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.addTagToBlock(req.params.blockId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to block:", error);
      res.status(500).json({ error: "Failed to add tag to block" });
    }
  });

  // Remove tag from block
  app.delete("/api/blocks/:blockId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromBlock(req.params.blockId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from block:", error);
      res.status(500).json({ error: "Failed to remove tag from block" });
    }
  });

  // Get tags for block
  app.get("/api/blocks/:blockId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForBlock(req.params.blockId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching block tags:", error);
      res.status(500).json({ error: "Failed to fetch block tags" });
    }
  });

  // Add tag to property
  app.post("/api/properties/:propertyId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const property = await storage.getProperty(req.params.propertyId);
      const tag = await storage.getTag(req.params.tagId);

      if (!property || !tag) {
        return res.status(404).json({ error: "Property or tag not found" });
      }

      if (property.organizationId !== user?.organizationId || tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.addTagToProperty(req.params.propertyId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to property:", error);
      res.status(500).json({ error: "Failed to add tag to property" });
    }
  });

  // Remove tag from property
  app.delete("/api/properties/:propertyId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromProperty(req.params.propertyId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from property:", error);
      res.status(500).json({ error: "Failed to remove tag from property" });
    }
  });

  // Get tags for property
  app.get("/api/properties/:propertyId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForProperty(req.params.propertyId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching property tags:", error);
      res.status(500).json({ error: "Failed to fetch property tags" });
    }
  });

  // Add tag to user
  app.post("/api/users/:userId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      const targetUser = await storage.getUser(req.params.userId);
      const tag = await storage.getTag(req.params.tagId);

      if (!targetUser || !tag) {
        return res.status(404).json({ error: "User or tag not found" });
      }

      if (targetUser.organizationId !== user?.organizationId || tag.organizationId !== user?.organizationId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.addTagToUser(req.params.userId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to user:", error);
      res.status(500).json({ error: "Failed to add tag to user" });
    }
  });

  // Remove tag from user
  app.delete("/api/users/:userId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromUser(req.params.userId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from user:", error);
      res.status(500).json({ error: "Failed to remove tag from user" });
    }
  });

  // Get tags for user
  app.get("/api/users/:userId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForUser(req.params.userId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching user tags:", error);
      res.status(500).json({ error: "Failed to fetch user tags" });
    }
  });

  // Add tag to compliance document
  app.post("/api/compliance/:complianceId/tags/:tagId", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      await storage.addTagToComplianceDocument(req.params.complianceId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to compliance document:", error);
      res.status(500).json({ error: "Failed to add tag to compliance document" });
    }
  });

  // Remove tag from compliance document
  app.delete("/api/compliance/:complianceId/tags/:tagId", isAuthenticated, requireRole("owner", "compliance"), async (req: any, res) => {
    try {
      await storage.removeTagFromComplianceDocument(req.params.complianceId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from compliance document:", error);
      res.status(500).json({ error: "Failed to remove tag from compliance document" });
    }
  });

  // Get tags for compliance document
  app.get("/api/compliance/:complianceId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForComplianceDocument(req.params.complianceId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching compliance document tags:", error);
      res.status(500).json({ error: "Failed to fetch compliance document tags" });
    }
  });

  // Add tag to asset inventory
  app.post("/api/asset-inventory/:assetId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.addTagToAssetInventory(req.params.assetId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to asset inventory:", error);
      res.status(500).json({ error: "Failed to add tag to asset inventory" });
    }
  });

  // Remove tag from asset inventory
  app.delete("/api/asset-inventory/:assetId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromAssetInventory(req.params.assetId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from asset inventory:", error);
      res.status(500).json({ error: "Failed to remove tag from asset inventory" });
    }
  });

  // Get tags for asset inventory
  app.get("/api/asset-inventory/:assetId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForAssetInventory(req.params.assetId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching asset inventory tags:", error);
      res.status(500).json({ error: "Failed to fetch asset inventory tags" });
    }
  });

  // Add tag to maintenance request
  app.post("/api/maintenance/:requestId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.addTagToMaintenanceRequest(req.params.requestId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to maintenance request:", error);
      res.status(500).json({ error: "Failed to add tag to maintenance request" });
    }
  });

  // Remove tag from maintenance request
  app.delete("/api/maintenance/:requestId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      await storage.removeTagFromMaintenanceRequest(req.params.requestId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from maintenance request:", error);
      res.status(500).json({ error: "Failed to remove tag from maintenance request" });
    }
  });

  // Get tags for maintenance request
  app.get("/api/maintenance/:requestId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForMaintenanceRequest(req.params.requestId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching maintenance request tags:", error);
      res.status(500).json({ error: "Failed to fetch maintenance request tags" });
    }
  });

  // Add tag to contact
  app.post("/api/contacts/:contactId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      await storage.addTagToContact(req.params.contactId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding tag to contact:", error);
      res.status(500).json({ error: "Failed to add tag to contact" });
    }
  });

  // Remove tag from contact
  app.delete("/api/contacts/:contactId/tags/:tagId", isAuthenticated, requireRole("owner", "clerk", "compliance"), async (req: any, res) => {
    try {
      await storage.removeTagFromContact(req.params.contactId, req.params.tagId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing tag from contact:", error);
      res.status(500).json({ error: "Failed to remove tag from contact" });
    }
  });

  // Get tags for contact
  app.get("/api/contacts/:contactId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const tags = await storage.getTagsForContact(req.params.contactId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching contact tags:", error);
      res.status(500).json({ error: "Failed to fetch contact tags" });
    }
  });

  // Search entities by tags
  app.post("/api/tags/search", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ error: "User not associated with an organization" });
      }

      const { tagIds } = req.body;
      if (!Array.isArray(tagIds)) {
        return res.status(400).json({ error: "tagIds must be an array" });
      }

      const results = await storage.searchByTags(user.organizationId, tagIds);
      res.json(results);
    } catch (error) {
      console.error("Error searching by tags:", error);
      res.status(500).json({ error: "Failed to search by tags" });
    }
  });

  // ==================== DASHBOARD PREFERENCES ROUTES ====================
  
  // Define role-based panel permissions
  const PANEL_PERMISSIONS: Record<string, string[]> = {
    stats: ["owner", "clerk", "compliance"],
    inspections: ["owner", "clerk"],
    compliance: ["owner", "compliance"],
    maintenance: ["owner", "clerk"],
    assets: ["owner", "clerk"],
    workOrders: ["owner", "contractor"],
    inspectionTrend: ["owner", "clerk"],
    statusDistribution: ["owner", "clerk", "compliance"],
    credits: ["owner"],
  };

  // Get allowed panels for a role
  function getAllowedPanels(role: string): string[] {
    return Object.keys(PANEL_PERMISSIONS).filter(panel => 
      PANEL_PERMISSIONS[panel].includes(role)
    );
  }

  // Filter panels based on role permissions
  function filterPanelsByRole(panels: string[], role: string): string[] {
    const allowed = getAllowedPanels(role);
    return panels.filter(panel => allowed.includes(panel));
  }

  // Get dashboard preferences
  app.get("/api/dashboard/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const prefs = await storage.getDashboardPreferences(userId);
      
      // Default panels based on role
      const defaultPanels = getAllowedPanels(user.role);
      
      if (!prefs) {
        return res.json({ enabledPanels: defaultPanels });
      }

      // Parse enabled panels if stored as string
      let enabledPanels = prefs.enabledPanels;
      if (typeof enabledPanels === "string") {
        enabledPanels = JSON.parse(enabledPanels);
      }

      // Filter panels to only those allowed for user's role
      const filteredPanels = filterPanelsByRole(enabledPanels as string[], user.role);
      
      res.json({ enabledPanels: filteredPanels });
    } catch (error) {
      console.error("Error fetching dashboard preferences:", error);
      res.status(500).json({ error: "Failed to fetch dashboard preferences" });
    }
  });

  // Update dashboard preferences
  app.put("/api/dashboard/preferences", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { enabledPanels } = req.body;
      
      if (!Array.isArray(enabledPanels)) {
        return res.status(400).json({ error: "enabledPanels must be an array" });
      }

      // Filter panels to only those allowed for user's role
      const filteredPanels = filterPanelsByRole(enabledPanels, user.role);

      const prefs = await storage.updateDashboardPreferences(userId, filteredPanels);
      res.json({ ...prefs, enabledPanels: filteredPanels });
    } catch (error) {
      console.error("Error updating dashboard preferences:", error);
      res.status(500).json({ error: "Failed to update dashboard preferences" });
    }
  });

  // ==================== INSPECTION TEMPLATE ROUTES ====================

  // Template Categories
  app.get("/api/template-categories", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const categories = await storage.getTemplateCategoriesByOrganization(user.organizationId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching template categories:", error);
      res.status(500).json({ message: "Failed to fetch template categories" });
    }
  });

  app.post("/api/template-categories", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertTemplateCategorySchema.parse({
        ...req.body,
        organizationId: user.organizationId
      });
      const category = await storage.createTemplateCategory(validatedData);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating template category:", error);
      res.status(400).json({ message: "Failed to create template category" });
    }
  });

  app.put("/api/template-categories/:id", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      // Verify ownership
      const existing = await storage.getTemplateCategory(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Category not found" });
      }
      const category = await storage.updateTemplateCategory(req.params.id, req.body);
      res.json(category);
    } catch (error) {
      console.error("Error updating template category:", error);
      res.status(400).json({ message: "Failed to update template category" });
    }
  });

  app.delete("/api/template-categories/:id", isAuthenticated, requireRole('owner'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getTemplateCategory(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Category not found" });
      }
      await storage.deleteTemplateCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting template category:", error);
      res.status(500).json({ message: "Failed to delete template category" });
    }
  });

  // Inspection Templates
  app.get("/api/inspection-templates", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const { scope, categoryId, active } = req.query;
      let templates = await storage.getInspectionTemplatesByOrganization(user.organizationId);
      
      // Apply filtering based on query parameters
      if (scope && scope !== 'all') {
        if (scope === 'both') {
          // When filtering by "both", show ONLY templates with scope='both'
          templates = templates.filter(t => t.scope === 'both');
        } else {
          // When filtering by specific scope (property/block), also include templates with scope='both'
          templates = templates.filter(t => t.scope === scope || t.scope === 'both');
        }
      }
      if (categoryId && categoryId !== 'all') {
        templates = templates.filter(t => t.categoryId === categoryId);
      }
      if (active !== undefined && active !== 'all') {
        const isActive = active === 'true';
        templates = templates.filter(t => t.isActive === isActive);
      }
      
      res.json(templates);
    } catch (error) {
      console.error("Error fetching inspection templates:", error);
      res.status(500).json({ message: "Failed to fetch inspection templates" });
    }
  });

  app.get("/api/inspection-templates/:id", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const template = await storage.getInspectionTemplate(req.params.id);
      if (!template || template.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching inspection template:", error);
      res.status(500).json({ message: "Failed to fetch inspection template" });
    }
  });

  app.post("/api/inspection-templates", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertInspectionTemplateSchema.parse({
        ...req.body,
        organizationId: user.organizationId,
        createdBy: req.user.id
      });
      const template = await storage.createInspectionTemplate(validatedData);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating inspection template:", error);
      res.status(400).json({ message: "Failed to create inspection template" });
    }
  });

  app.put("/api/inspection-templates/:id", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getInspectionTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Prepare updates - stringify structureJson if it's an object
      const updates: any = { ...req.body };
      if (updates.structureJson && typeof updates.structureJson !== 'string') {
        updates.structureJson = JSON.stringify(updates.structureJson);
      }
      
      // Remove fields that shouldn't be updated via API
      delete updates.id;
      delete updates.organizationId;
      delete updates.createdBy;
      delete updates.createdAt;
      delete updates.updatedAt;
      
      const template = await storage.updateInspectionTemplate(req.params.id, updates);
      res.json(template);
    } catch (error) {
      console.error("Error updating inspection template:", error);
      res.status(400).json({ message: "Failed to update inspection template" });
    }
  });

  app.delete("/api/inspection-templates/:id", isAuthenticated, requireRole('owner'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getInspectionTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      await storage.deleteInspectionTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inspection template:", error);
      res.status(500).json({ message: "Failed to delete inspection template" });
    }
  });

  // Clone template (create new version)
  app.post("/api/inspection-templates/:id/clone", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const existing = await storage.getInspectionTemplate(req.params.id);
      if (!existing || existing.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Create new template with incremented version
      const newVersion = existing.version + 1;
      const clonedTemplate = await storage.createInspectionTemplate({
        organizationId: user.organizationId,
        name: req.body.name || `${existing.name} (v${newVersion})`,
        description: req.body.description || existing.description,
        categoryId: existing.categoryId,
        scope: existing.scope,
        structureJson: existing.structureJson as any,
        version: newVersion,
        parentTemplateId: existing.parentTemplateId || existing.id,
        isActive: req.body.isActive ?? false,
        createdBy: req.user.id
      });
      
      res.status(201).json(clonedTemplate);
    } catch (error) {
      console.error("Error cloning inspection template:", error);
      res.status(400).json({ message: "Failed to clone inspection template" });
    }
  });

  // Template Inventory Links
  app.get("/api/inspection-templates/:templateId/inventory-links", isAuthenticated, requireRole('owner', 'clerk', 'compliance'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const template = await storage.getInspectionTemplate(req.params.templateId);
      if (!template || template.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Template not found" });
      }
      const links = await storage.getTemplateInventoryLinks(req.params.templateId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching template inventory links:", error);
      res.status(500).json({ message: "Failed to fetch template inventory links" });
    }
  });

  app.post("/api/template-inventory-links", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertTemplateInventoryLinkSchema.parse(req.body);
      // Verify template ownership
      const template = await storage.getInspectionTemplate(validatedData.templateId);
      if (!template || template.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      const link = await storage.createTemplateInventoryLink(validatedData);
      res.status(201).json(link);
    } catch (error) {
      console.error("Error creating template inventory link:", error);
      res.status(400).json({ message: "Failed to create template inventory link" });
    }
  });

  app.delete("/api/template-inventory-links/:id", isAuthenticated, requireRole('owner', 'clerk'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      await storage.deleteTemplateInventoryLink(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting template inventory link:", error);
      res.status(500).json({ message: "Failed to delete template inventory link" });
    }
  });

  // Inspection Entries
  app.get("/api/inspections/:inspectionId/entries", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      // Set cache-control headers to prevent caching
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const entries = await storage.getInspectionEntries(req.params.inspectionId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching inspection entries:", error);
      res.status(500).json({ message: "Failed to fetch inspection entries" });
    }
  });

  app.get("/api/inspection-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const entry = await storage.getInspectionEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      res.json(entry);
    } catch (error) {
      console.error("Error fetching inspection entry:", error);
      res.status(500).json({ message: "Failed to fetch inspection entry" });
    }
  });

  app.post("/api/inspection-entries", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const validatedData = insertInspectionEntrySchema.parse(req.body);
      
      // Check if an entry already exists for this inspection, section, and field
      // This allows updating existing entries instead of creating duplicates
      const existingEntries = await storage.getInspectionEntries(validatedData.inspectionId);
      const existingEntry = existingEntries.find(
        (e: any) => 
          e.sectionRef === validatedData.sectionRef && 
          e.fieldKey === validatedData.fieldKey &&
          e.inspectionId === validatedData.inspectionId
      );
      
      let entry;
      if (existingEntry?.id) {
        // Update existing entry
        entry = await storage.updateInspectionEntry(existingEntry.id, validatedData);
        res.json(entry);
      } else {
        // Create new entry
        entry = await storage.createInspectionEntry(validatedData);
        res.status(201).json(entry);
      }
    } catch (error) {
      console.error("Error creating/updating inspection entry:", error);
      res.status(400).json({ message: "Failed to create/update inspection entry" });
    }
  });

  // Batch create entries (for offline sync)
  app.post("/api/inspection-entries/batch", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const { entries } = req.body;
      if (!Array.isArray(entries)) {
        return res.status(400).json({ message: "entries must be an array" });
      }
      const validatedEntries = entries.map(e => insertInspectionEntrySchema.parse(e));
      const created = await storage.createInspectionEntriesBatch(validatedEntries);
      res.status(201).json(created);
    } catch (error) {
      console.error("Error batch creating inspection entries:", error);
      res.status(400).json({ message: "Failed to batch create inspection entries" });
    }
  });

  app.put("/api/inspection-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const entry = await storage.updateInspectionEntry(req.params.id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating inspection entry:", error);
      res.status(400).json({ message: "Failed to update inspection entry" });
    }
  });

  app.patch("/api/inspection-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const entry = await storage.updateInspectionEntry(req.params.id, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error updating inspection entry:", error);
      res.status(400).json({ message: "Failed to update inspection entry" });
    }
  });

  app.delete("/api/inspection-entries/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      await storage.deleteInspectionEntry(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting inspection entry:", error);
      res.status(500).json({ message: "Failed to delete inspection entry" });
    }
  });

  // AI Image Analyses
  app.get("/api/inspections/:inspectionId/ai-analyses", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const analyses = await storage.getAiImageAnalysesByInspection(req.params.inspectionId);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching AI analyses:", error);
      res.status(500).json({ message: "Failed to fetch AI analyses" });
    }
  });

  app.get("/api/inspection-entries/:entryId/ai-analyses", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      const analyses = await storage.getAiImageAnalysesByEntry(req.params.entryId);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching AI analyses:", error);
      res.status(500).json({ message: "Failed to fetch AI analyses" });
    }
  });

  app.post("/api/ai-analyses", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const { inspectionId, inspectionEntryId, imageUrl, context } = req.body;

      // Verify user has access to this inspection
      const inspection = await storage.getInspection(inspectionId);
      if (!inspection) {
        return res.status(404).json({ message: "Inspection not found" });
      }

      // Check if organization has credits
      const org = await storage.getOrganization(user.organizationId);
      if (!org || (org.creditsRemaining ?? 0) < 1) {
        return res.status(402).json({ message: "Insufficient AI credits" });
      }

      // Convert image URL to base64 data URL (for internal object storage)
      console.log("[Individual Photo Analysis] Processing photo:", imageUrl);
      
      let dataUrl: string;
      if (imageUrl.startsWith("http")) {
        // External URL - use directly
        dataUrl = imageUrl;
        console.log("[Individual Photo Analysis] Using external URL directly");
      } else {
        // Internal object storage - convert to base64
        try {
          const objectStorageService = new ObjectStorageService();
          // Ensure path starts with /objects/
          const photoPath = imageUrl.startsWith('/objects/') ? imageUrl : `/objects/${imageUrl}`;
          const objectFile = await objectStorageService.getObjectEntityFile(photoPath);
          
          // Read the file contents using fs.readFile first
          const photoBuffer = await fs.readFile(objectFile.name);
          
          // Always detect MIME type from buffer for reliability
          let mimeType = detectImageMimeType(photoBuffer);
          
          // Get metadata for logging purposes
          const [metadata] = await objectFile.getMetadata();
          const metadataContentType = metadata.contentType;
          
          console.log(`[Individual Photo Analysis] MIME type detection:`, {
            detected: mimeType,
            fromMetadata: metadataContentType,
            bufferSize: photoBuffer.length,
            firstBytes: Array.from(photoBuffer.slice(0, 12)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ')
          });
          
          // Ensure we have a valid image MIME type
          if (!mimeType || !mimeType.startsWith('image/')) {
            console.warn(`[Individual Photo Analysis] Invalid MIME type detected: ${mimeType}, defaulting to image/jpeg`);
            mimeType = 'image/jpeg';
          }
          
          // Convert to base64 data URL
          const base64Image = photoBuffer.toString('base64');
          dataUrl = `data:${mimeType};base64,${base64Image}`;
          
          // Validate the data URL format
          if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
            throw new Error(`Invalid data URL format: ${dataUrl.substring(0, 50)}...`);
          }
          
          console.log("[Individual Photo Analysis] Converted to base64 data URL:", photoPath, `(${mimeType}, ${base64Image.length} bytes)`);
        } catch (error: any) {
          // Safely log error without circular reference issues
          const errorMessage = error?.message || String(error);
          console.error("[Individual Photo Analysis] Error converting photo to base64:", {
            imageUrl,
            message: errorMessage,
            errorType: error?.constructor?.name,
          });
          if (error instanceof ObjectNotFoundError) {
            throw new Error(`Photo not found: ${imageUrl}. The file may have been deleted or moved.`);
          }
          throw new Error(`Failed to load photo for analysis: ${imageUrl}. ${errorMessage}`);
        }
      }

      // Call OpenAI Vision API using Responses API
      const openaiClient = getOpenAI();
      const response = await openaiClient.responses.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        input: [
          {
            role: "user",
            content: normalizeApiContent([
              {
                type: "text",
                text: context || "Analyze this inspection photo. Identify the room/item, assess its condition, note any defects, damage, or issues that require attention. Provide a detailed assessment."
              },
              {
                type: "image_url",
                image_url: dataUrl
              }
            ])
          }
        ],
        max_output_tokens: 500
      });

      let analysisText = response.output_text || (response.output?.[0] as any)?.content?.[0]?.text || "";
      
      // Strip markdown asterisks from the response
      analysisText = analysisText.replace(/\*\*/g, '');

      // Deduct credit
      await storage.updateOrganizationCredits(user.organizationId, (org.creditsRemaining ?? 0) - 1);

      // Save analysis
      const validatedData = insertAiImageAnalysisSchema.parse({
        inspectionId: inspectionId || undefined,
        inspectionEntryId: inspectionEntryId || undefined,
        mediaUrl: imageUrl, // Schema expects mediaUrl, not imageUrl
        mediaType: "photo",
        model: "gpt-5",
        resultJson: { text: analysisText, model: "gpt-5" },
      });
      const analysis = await storage.createAiImageAnalysis(validatedData);

      res.status(201).json({ ...analysis, remainingCredits: (org.creditsRemaining ?? 0) - 1 });
    } catch (error: any) {
      // Safely log error without circular reference issues
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack;
      console.error("Error creating AI analysis:", {
        message: errorMessage,
        stack: errorStack,
        status: error?.status,
        code: error?.code,
        type: error?.type,
      });
      res.status(500).json({ message: "Failed to create AI analysis" });
    }
  });

  // ==================== OBJECT STORAGE ROUTES ====================
  
  app.get("/objects/:objectPath(*)", async (req: any, res) => {
    const userId = req.user?.claims?.sub || req.user?.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        // Object not found is a normal case, return 404 without logging as error
        return res.sendStatus(404);
      }
      // Only log unexpected errors
      console.error("Error checking object access:", error);
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const relativePath = await objectStorageService.getObjectEntityUploadURL();
      
      // Convert relative path to absolute URL
      const baseUrl = getBaseUrl(req);
      const uploadURL = `${baseUrl}${relativePath}`;
      
      res.json({ uploadURL });
    } catch (error: any) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Generate upload URL for branding/logo uploads (used by Settings page)
  app.post("/api/upload/generate-upload-url", isAuthenticated, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const relativePath = await objectStorageService.getObjectEntityUploadURL();
      
      // Convert relative path to absolute URL
      const baseUrl = getBaseUrl(req);
      const uploadUrl = `${baseUrl}${relativePath}`;
      
      res.json({ uploadUrl });
    } catch (error: any) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Direct upload endpoint for local storage (returns upload URL that points to upload-file)
  // Supports both POST (multer) and PUT (raw body) for compatibility with Uppy AwsS3 plugin
  app.post("/api/objects/upload-direct", isAuthenticated, upload.single('file'), async (req: any, res: any) => {
    try {
      const objectId = req.query.objectId || randomUUID();
      const objectStorageService = new ObjectStorageService();

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const normalizedPath = await objectStorageService.saveUploadedFile(
        objectId as string,
        req.file.buffer,
        req.file.mimetype
      );

      // Generate ETag for S3 compatibility (Uppy AwsS3 plugin requires this)
      const etag = createHash('md5').update(req.file.buffer).digest('hex');
      
      // Set ETag header for S3 compatibility (required by Uppy)
      res.set('ETag', `"${etag}"`);
      // Also set CORS headers to allow reading ETag
      res.set('Access-Control-Expose-Headers', 'ETag');

      // Set ACL to public
      const userId = req.user?.claims?.sub || req.user?.id;
      if (userId) {
        try {
          await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
            owner: userId,
            visibility: "public",
          });
        } catch (error) {
          console.warn("Failed to set ACL:", error);
        }
      }

      res.json({ 
        url: normalizedPath,
        uploadURL: normalizedPath
      });
    } catch (error) {
      console.error("Error in upload-direct:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Handle PUT requests (for Uppy AwsS3 plugin - raw body, not multer)
  // IMPORTANT: This endpoint must ALWAYS return JSON on errors to prevent HTML parsing errors in Uppy
  app.put("/api/objects/upload-direct", async (req: any, res: any) => {
    console.log('[upload-direct] PUT request received:', {
      method: req.method,
      url: req.url,
      path: req.path,
      authenticated: req.isAuthenticated(),
      hasBody: !!req.body,
      contentType: req.headers['content-type'],
    });
    
    // Set JSON content type IMMEDIATELY to prevent any HTML responses
    res.set('Content-Type', 'application/json');
    
    // Check authentication first and return JSON if not authenticated
    if (!req.isAuthenticated()) {
      console.error('[upload-direct] Unauthenticated PUT request');
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Set content type early to prevent HTML responses
    // For successful uploads, return empty body (S3-compatible)
    // For errors, return JSON
    
    let responseSent = false;
    const sendError = (status: number, message: string) => {
      if (!responseSent) {
        responseSent = true;
        res.set('Content-Type', 'application/json');
        console.error(`[upload-direct] Error ${status}: ${message}`);
        res.status(status).json({ error: message });
      }
    };

    try {
      const objectId = req.query.objectId || randomUUID();
      const objectStorageService = new ObjectStorageService();

      // For PUT requests, read raw body
      const chunks: Buffer[] = [];
      
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      
      req.on('end', async () => {
        try {
          const fileBuffer = Buffer.concat(chunks);
          
          if (fileBuffer.length === 0) {
            return sendError(400, "No file uploaded");
          }

          // Get content type from headers
          const contentType = req.headers['content-type'] || 'application/octet-stream';

          const normalizedPath = await objectStorageService.saveUploadedFile(
            objectId as string,
            fileBuffer,
            contentType
          );

          // Generate ETag for S3 compatibility (Uppy AwsS3 plugin requires this)
          const etag = createHash('md5').update(fileBuffer).digest('hex');
          
          // Set ETag header for S3 compatibility (required by Uppy)
          res.set('ETag', `"${etag}"`);
          // Also set CORS headers to allow reading ETag
          res.set('Access-Control-Expose-Headers', 'ETag');

          // Set ACL to public
          const userId = req.user?.claims?.sub || req.user?.id;
          if (userId) {
            try {
              await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
                owner: userId,
                visibility: "public",
              });
            } catch (error) {
              console.warn("Failed to set ACL:", error);
              // Don't fail the upload if ACL setting fails
            }
          }

          if (!responseSent) {
            responseSent = true;
            // Uppy AwsS3 plugin expects S3-compatible response
            // Return empty body with just ETag header (S3 standard)
            // The extractFileUrlFromUploadResponse utility will use the upload URL from metadata
            // Remove Content-Type header for empty body (S3 doesn't send it)
            res.removeHeader('Content-Type');
            res.status(200).end();
          }
        } catch (error: any) {
          console.error("Error in upload-direct PUT (end handler):", error);
          sendError(500, error.message || "Internal server error");
        }
      });
      
      req.on('error', (error: any) => {
        console.error("Error reading request body in upload-direct PUT:", error);
        sendError(500, "Error reading file data");
      });
      
      // Set timeout to prevent hanging requests
      req.setTimeout(300000, () => { // 5 minutes
        if (!responseSent) {
          sendError(408, "Request timeout");
        }
      });
    } catch (error: any) {
      console.error("Error in upload-direct PUT (outer catch):", error);
      sendError(500, error.message || "Internal server error");
    }
  });

  // Set ACL endpoint - must be BEFORE the catch-all route
  app.put("/api/objects/set-acl", isAuthenticated, async (req: any, res) => {
    if (!req.body.photoUrl) {
      return res.status(400).json({ error: "photoUrl is required" });
    }

    const userId = req.user?.claims?.sub;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.photoUrl,
        {
          owner: userId,
          visibility: "public",
        },
      );

      res.status(200).json({ objectPath });
    } catch (error: any) {
      console.error("Error setting object ACL:", error);
      const errorMessage = error?.message || "Internal server error";
      res.status(500).json({ error: errorMessage });
    }
  });

  // Catch-all for any other PUT requests to /api/objects/* that don't match
  // This ensures we return JSON instead of HTML if the route doesn't match
  app.put("/api/objects/*", (req: any, res: any) => {
    console.error('[upload-direct] PUT request to unmatched route:', req.path);
    res.set('Content-Type', 'application/json');
    res.status(404).json({ error: "Upload endpoint not found" });
  });

  // File upload endpoint using multer
  app.post("/api/objects/upload-file", isAuthenticated, upload.single('file'), async (req: any, res) => {
    // Always set JSON content type to prevent HTML responses
    res.set('Content-Type', 'application/json');
    
    try {
      const objectId = req.query.objectId || randomUUID();
      const objectStorageService = new ObjectStorageService();

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const normalizedPath = await objectStorageService.saveUploadedFile(
        objectId as string,
        req.file.buffer,
        req.file.mimetype
      );

      // Set ACL to public by default
      const userId = req.user?.claims?.sub || req.user?.id;
      if (userId) {
        try {
          await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
            owner: userId,
            visibility: "public",
          });
        } catch (error) {
          console.warn("Failed to set ACL for uploaded file:", error);
        }
      }

      res.json({ 
        url: normalizedPath,
        path: normalizedPath,
        objectId: objectId
      });
    } catch (error: any) {
      console.error("Error uploading file:", error);
      // Ensure we always return JSON, even on errors
      res.set('Content-Type', 'application/json');
      res.status(500).json({ error: error.message || "Failed to upload file" });
    }
  });

  // Alternative endpoint for S3-compatible clients (like Uppy)
  app.post("/api/object-storage/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const objectId = randomUUID();
      const objectStorageService = new ObjectStorageService();

      const normalizedPath = await objectStorageService.saveUploadedFile(
        objectId,
        req.file.buffer,
        req.file.mimetype
      );

      // Set ACL to public
      const userId = req.user?.claims?.sub || req.user?.id;
      if (userId) {
        try {
          await objectStorageService.trySetObjectEntityAclPolicy(normalizedPath, {
            owner: userId,
            visibility: "public",
          });
        } catch (error) {
          console.warn("Failed to set ACL:", error);
        }
      }

      // Return S3-compatible response
      res.json({
        url: normalizedPath,
        key: normalizedPath,
        bucket: "local",
      });
    } catch (error) {
      console.error("Error in S3-compatible upload:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.post("/api/objects/normalize", isAuthenticated, async (req, res) => {
    const { photoUrl } = req.body;
    if (!photoUrl) {
      return res.status(400).json({ error: "photoUrl is required" });
    }
    const objectStorageService = new ObjectStorageService();
    const normalizedPath = objectStorageService.normalizeObjectEntityPath(photoUrl);
    res.json({ normalizedPath });
  });

  // Fix existing photos - make them public
  app.post("/api/objects/fix-acls", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      const objectStorageService = new ObjectStorageService();
      
      // Get all assets with photos
      const assets = await storage.getAssetInventoryByOrganization(user.organizationId);
      const photosToFix: string[] = [];
      
      for (const asset of assets) {
        if (asset.photos && asset.photos.length > 0) {
          photosToFix.push(...asset.photos);
        }
      }
      
      // Get all inspection entries with photos
      const inspections = await storage.getInspectionsByOrganization(user.organizationId);
      for (const inspection of inspections) {
        const entries = await storage.getInspectionEntries(inspection.id);
        for (const entry of entries) {
          if (entry.photos && entry.photos.length > 0) {
            photosToFix.push(...entry.photos);
          }
        }
      }
      
      // Update ACL for each photo
      const fixed: string[] = [];
      const errors: string[] = [];
      
      for (const photoPath of photosToFix) {
        try {
          await objectStorageService.trySetObjectEntityAclPolicy(
            photoPath,
            {
              owner: userId,
              visibility: "public",
            },
          );
          fixed.push(photoPath);
        } catch (error) {
          console.error(`Failed to fix ACL for ${photoPath}:`, error);
          errors.push(photoPath);
        }
      }
      
      res.json({ 
        message: `Fixed ${fixed.length} photos (assets + inspections), ${errors.length} errors`,
        fixed: fixed.length,
        errors: errors.length 
      });
    } catch (error) {
      console.error("Error fixing ACLs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Backfill route: Sync photos from valueJson to photos column for all inspection entries
  app.post("/api/objects/sync-entry-photos", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ error: "No organization found" });
      }

      // Get all inspections for the organization
      const inspections = await storage.getInspectionsByOrganization(user.organizationId);
      let syncedCount = 0;
      let errorCount = 0;
      
      for (const inspection of inspections) {
        const entries = await storage.getInspectionEntries(inspection.id);
        for (const entry of entries) {
          try {
            // Extract photos from valueJson
            let extractedPhotos: string[] | null = null;
            const valueJson = entry.valueJson as any;
            
            if (valueJson && typeof valueJson === 'object') {
              if (Array.isArray(valueJson.photos)) {
                extractedPhotos = valueJson.photos;
              } else if (typeof valueJson.photo === 'string' && valueJson.photo) {
                extractedPhotos = [valueJson.photo];
              } else if (Array.isArray(valueJson)) {
                const isAllStrings = valueJson.every((item: any) => typeof item === 'string');
                if (isAllStrings && valueJson.length > 0) {
                  extractedPhotos = valueJson;
                }
              }
            }
            
            // Check if photos column needs updating
            const currentPhotos = entry.photos || [];
            const newPhotos = extractedPhotos || [];
            
            // Only update if there's a difference
            const photosMatch = currentPhotos.length === newPhotos.length && 
              currentPhotos.every((p, i) => p === newPhotos[i]);
            
            if (!photosMatch && extractedPhotos !== null) {
              await storage.updateInspectionEntry(entry.id, {
                photos: extractedPhotos.length > 0 ? extractedPhotos : null
              } as any);
              syncedCount++;
              console.log(`[Sync Entry Photos] Updated entry ${entry.id}: ${currentPhotos.length} -> ${newPhotos.length} photos`);
            }
          } catch (error) {
            console.error(`Error syncing photos for entry ${entry.id}:`, error);
            errorCount++;
          }
        }
      }
      
      res.json({ 
        message: `Synced photos for ${syncedCount} entries, ${errorCount} errors`,
        synced: syncedCount,
        errors: errorCount 
      });
    } catch (error) {
      console.error("Error syncing entry photos:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== ADMIN ROUTES ====================
  
  // Admin authentication middleware
  const isAdminAuthenticated = (req: any, res: any, next: any) => {
    if (req.session && (req.session as any).adminUser) {
      return next();
    }
    return res.status(401).json({ message: "Unauthorized - Admin access required" });
  };

  // Admin Login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const adminUser = await storage.getAdminByEmail(email);
      
      if (!adminUser) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(password, adminUser.password);
      
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Set admin session
      (req.session as any).adminUser = {
        id: adminUser.id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
      };

      res.json({
        id: adminUser.id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
      });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Admin Logout
  app.post("/api/admin/logout", (req, res) => {
    (req.session as any).adminUser = null;
    res.json({ message: "Logged out successfully" });
  });

  // Get current admin user
  app.get("/api/admin/me", isAdminAuthenticated, (req: any, res) => {
    res.json(req.session.adminUser);
  });

  // ==================== ADMIN INSTANCE MANAGEMENT ====================

  // Get all instances (organizations) with owner details
  app.get("/api/admin/instances", isAdminAuthenticated, async (req, res) => {
    try {
      const instances = await storage.getAllOrganizationsWithOwners();
      res.json(instances);
    } catch (error) {
      console.error("Error fetching instances:", error);
      res.status(500).json({ message: "Failed to fetch instances" });
    }
  });

  // Get single instance details
  app.get("/api/admin/instances/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const instance = await storage.getOrganizationWithOwner(req.params.id);
      if (!instance) {
        return res.status(404).json({ message: "Instance not found" });
      }
      res.json(instance);
    } catch (error) {
      console.error("Error fetching instance:", error);
      res.status(500).json({ message: "Failed to fetch instance" });
    }
  });

  // Update instance (subscription level, credits, active status)
  app.patch("/api/admin/instances/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const { subscriptionLevel, creditsRemaining, isActive } = req.body;
      const updated = await storage.updateOrganization(req.params.id, {
        subscriptionLevel,
        creditsRemaining,
        isActive,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating instance:", error);
      res.status(500).json({ message: "Failed to update instance" });
    }
  });

  // Disable/Enable instance
  app.post("/api/admin/instances/:id/toggle-status", isAdminAuthenticated, async (req, res) => {
    try {
      const org = await storage.getOrganization(req.params.id);
      if (!org) {
        return res.status(404).json({ message: "Instance not found" });
      }
      
      const updated = await storage.updateOrganization(req.params.id, {
        isActive: !org.isActive,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error toggling instance status:", error);
      res.status(500).json({ message: "Failed to toggle status" });
    }
  });

  // ==================== ADMIN TEAM MANAGEMENT ====================

  // Get all admin users
  app.get("/api/admin/team", isAdminAuthenticated, async (req, res) => {
    try {
      const admins = await storage.getAllAdmins();
      // Remove password from response
      const sanitizedAdmins = admins.map(({ password, ...admin }) => admin);
      res.json(sanitizedAdmins);
    } catch (error) {
      console.error("Error fetching admin team:", error);
      res.status(500).json({ message: "Failed to fetch admin team" });
    }
  });

  // Create admin user
  app.post("/api/admin/team", isAdminAuthenticated, async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const admin = await storage.createAdmin({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      });

      // Remove password from response
      const { password: _, ...sanitizedAdmin } = admin;
      res.json(sanitizedAdmin);
    } catch (error: any) {
      console.error("Error creating admin:", error);
      if (error.message?.includes("duplicate") || error.code === "23505") {
        return res.status(400).json({ message: "Email already exists" });
      }
      res.status(500).json({ message: "Failed to create admin" });
    }
  });

  // Update admin user
  app.patch("/api/admin/team/:id", isAdminAuthenticated, async (req, res) => {
    try {
      const { email, firstName, lastName, password } = req.body;
      const updateData: any = { email, firstName, lastName };

      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      const admin = await storage.updateAdmin(req.params.id, updateData);
      const { password: _, ...sanitizedAdmin } = admin;
      res.json(sanitizedAdmin);
    } catch (error) {
      console.error("Error updating admin:", error);
      res.status(500).json({ message: "Failed to update admin" });
    }
  });

  // Delete admin user
  app.delete("/api/admin/team/:id", isAdminAuthenticated, async (req: any, res) => {
    try {
      // Prevent self-deletion
      if (req.params.id === req.session.adminUser.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      await storage.deleteAdmin(req.params.id);
      res.json({ message: "Admin deleted successfully" });
    } catch (error) {
      console.error("Error deleting admin:", error);
      res.status(500).json({ message: "Failed to delete admin" });
    }
  });

  // ==================== FIXFLO INTEGRATION ROUTES ====================

  // Get Fixflo configuration for current organization
  app.get("/api/fixflo/config", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }
      
      const config = await storage.getFixfloConfig(user.organizationId);
      if (!config) {
        return res.status(404).json({ message: "Fixflo not configured for this organization" });
      }

      // Don't send the bearer token to the frontend
      const { bearerToken: _, ...safeConfig } = config;
      res.json(safeConfig);
    } catch (error) {
      console.error("Error fetching Fixflo config:", error);
      res.status(500).json({ message: "Failed to fetch Fixflo configuration" });
    }
  });

  // Update Fixflo configuration
  app.post("/api/fixflo/config", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const { baseUrl, bearerToken, webhookVerifyToken, isEnabled } = req.body;
      
      if (!baseUrl || !bearerToken) {
        return res.status(400).json({ message: "Base URL and Bearer Token are required" });
      }

      const config = await storage.upsertFixfloConfig({
        organizationId: user.organizationId,
        baseUrl,
        bearerToken,
        webhookVerifyToken,
        isEnabled: isEnabled ?? false,
      });

      // Don't send the bearer token back
      const { bearerToken: _, ...safeConfig } = config;
      res.json(safeConfig);
    } catch (error) {
      console.error("Error updating Fixflo config:", error);
      res.status(500).json({ message: "Failed to update Fixflo configuration" });
    }
  });

  // Health check Fixflo API connection
  app.post("/api/fixflo/health-check", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const config = await storage.getFixfloConfig(user.organizationId);
      if (!config) {
        return res.status(404).json({ message: "Fixflo not configured" });
      }

      const { createFixfloClient, FixfloClientError } = await import("./services/fixflo-client");
      const client = await createFixfloClient(config);
      const isHealthy = await client.healthCheck();

      await storage.updateFixfloHealthCheck(user.organizationId, {
        lastHealthCheck: new Date(),
        healthCheckStatus: isHealthy ? "healthy" : "error",
        lastError: isHealthy ? null : "Health check failed",
      });

      res.json({ healthy: isHealthy });
    } catch (error: any) {
      console.error("Error performing Fixflo health check:", error);
      
      const user = await storage.getUser(req.user.id);
      if (user?.organizationId) {
        await storage.updateFixfloHealthCheck(user.organizationId, {
          lastHealthCheck: new Date(),
          healthCheckStatus: "error",
          lastError: error.message || "Unknown error",
        });
      }

      res.status(500).json({ 
        healthy: false, 
        message: error.message || "Health check failed" 
      });
    }
  });

  // Create issue in Fixflo from maintenance request
  app.post("/api/fixflo/issues", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const { maintenanceRequestId, propertyId, title, description, priority, category } = req.body;

      if (!maintenanceRequestId || !propertyId) {
        return res.status(400).json({ message: "Maintenance request ID and property ID are required" });
      }

      // Get Fixflo config
      const config = await storage.getFixfloConfig(user.organizationId);
      if (!config?.isEnabled) {
        return res.status(400).json({ message: "Fixflo integration is not enabled" });
      }

      // Get property to check for Fixflo property ID
      const property = await storage.getProperty(propertyId);
      if (!property || property.organizationId !== user.organizationId) {
        return res.status(404).json({ message: "Property not found" });
      }

      if (!property.fixfloPropertyId) {
        return res.status(400).json({ 
          message: "Property is not mapped to Fixflo. Please configure property mapping first." 
        });
      }

      // Create issue in Fixflo
      const { createFixfloClient } = await import("./services/fixflo-client");
      const client = await createFixfloClient(config);
      
      const fixfloResponse = await client.createIssue({
        propertyId: property.fixfloPropertyId,
        title,
        description,
        priority: priority || "medium",
        category,
        externalRef: maintenanceRequestId,
      });

      // Update maintenance request with Fixflo IDs
      await storage.updateMaintenanceRequest(maintenanceRequestId, {
        fixfloIssueId: fixfloResponse.id,
        fixfloJobId: fixfloResponse.jobId,
        fixfloStatus: fixfloResponse.status,
        fixfloSyncedAt: new Date(),
      });

      res.json({
        success: true,
        fixfloIssueId: fixfloResponse.id,
        fixfloJobId: fixfloResponse.jobId,
        status: fixfloResponse.status,
      });
    } catch (error: any) {
      console.error("Error creating Fixflo issue:", error);
      res.status(500).json({ 
        message: "Failed to create issue in Fixflo",
        error: error.message 
      });
    }
  });

  // Update issue in Fixflo
  app.patch("/api/fixflo/issues/:issueId", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const { issueId } = req.params;
      const { priority, status, assignedAgentId, notes } = req.body;

      // Get Fixflo config
      const config = await storage.getFixfloConfig(user.organizationId);
      if (!config?.isEnabled) {
        return res.status(400).json({ message: "Fixflo integration is not enabled" });
      }

      // Update issue in Fixflo
      const { createFixfloClient } = await import("./services/fixflo-client");
      const client = await createFixfloClient(config);
      
      const fixfloResponse = await client.updateIssue(issueId, {
        priority,
        status,
        notes,
      });

      // If contractor was assigned, do that separately
      if (assignedAgentId) {
        await client.assignContractor(issueId, assignedAgentId);
      }

      res.json({
        success: true,
        status: fixfloResponse.status,
      });
    } catch (error: any) {
      console.error("Error updating Fixflo issue:", error);
      res.status(500).json({ 
        message: "Failed to update issue in Fixflo",
        error: error.message 
      });
    }
  });

  // Get Fixflo sync state for organization
  app.get("/api/fixflo/sync-state", isAuthenticated, requireRole("owner", "clerk"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const syncStates = await storage.getFixfloSyncStates(user.organizationId);
      res.json(syncStates);
    } catch (error) {
      console.error("Error fetching Fixflo sync state:", error);
      res.status(500).json({ message: "Failed to fetch sync state" });
    }
  });

  // Get Fixflo webhook logs for debugging
  app.get("/api/fixflo/webhook-logs", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(403).json({ message: "User not in organization" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getFixfloWebhookLogs(user.organizationId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching Fixflo webhook logs:", error);
      res.status(500).json({ message: "Failed to fetch webhook logs" });
    }
  });

  // Inbound webhook endpoint from Fixflo
  app.post("/api/integrations/fixflo/webhook", async (req, res) => {
    const { processFixfloWebhook } = await import("./services/fixflo-webhook-processor");
    
    try {
      // Get the organization ID from webhook payload or headers
      const organizationId = req.body.organizationId || req.headers["x-organization-id"];
      
      if (!organizationId) {
        console.error("[Fixflo Webhook] No organization ID provided");
        return res.status(400).json({ message: "Organization ID required" });
      }

      // Get Fixflo config to verify webhook token
      const config = await storage.getFixfloConfig(organizationId as string);
      if (!config) {
        console.error("[Fixflo Webhook] No config found for organization:", organizationId);
        return res.status(404).json({ message: "Fixflo not configured for this organization" });
      }

      // Verify webhook token if configured
      const webhookToken = req.headers["x-fixflo-webhook-token"];
      if (config.webhookVerifyToken && webhookToken !== config.webhookVerifyToken) {
        console.error("[Fixflo Webhook] Invalid webhook token");
        return res.status(403).json({ message: "Invalid webhook token" });
      }

      const payload = req.body;
      const eventType = payload.eventType || payload.event || "Unknown";
      
      // Create webhook log for audit trail
      const webhookLog = await storage.createFixfloWebhookLog({
        organizationId: organizationId as string,
        eventType,
        fixfloIssueId: payload.issueId || payload.Issue?.Id,
        fixfloJobId: payload.jobId || payload.Job?.Id,
        payloadJson: payload,
        processingStatus: "pending",
        retryCount: 0,
      });

      // Return 200 immediately to acknowledge receipt
      res.status(200).json({ received: true, webhookLogId: webhookLog.id });

      // Process webhook asynchronously
      processFixfloWebhook(webhookLog.id, organizationId as string, payload, storage)
        .catch((error: any) => {
          console.error("[Fixflo Webhook] Processing error:", error);
        });

    } catch (error: any) {
      console.error("[Fixflo Webhook] Error receiving webhook:", error);
      res.status(500).json({ 
        message: "Failed to process webhook",
        error: error.message 
      });
    }
  });

  // ==================== SUBSCRIPTION & BILLING ROUTES ====================
  
  const { subscriptionService } = await import("./subscriptionService");

  // Get all active subscription plans
  app.get("/api/billing/plans", async (req, res) => {
    try {
      const plans = await storage.getActivePlans();
      res.json(plans);
    } catch (error: any) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Get pricing for a specific plan and country
  app.get("/api/billing/plans/:planId/pricing", async (req, res) => {
    try {
      const { planId } = req.params;
      const countryCode = (req.query.country as string) || "GB";
      
      const pricing = await subscriptionService.getEffectivePricing(planId, countryCode);
      res.json(pricing);
    } catch (error: any) {
      console.error("Error fetching pricing:", error);
      res.status(500).json({ message: "Failed to fetch pricing", error: error.message });
    }
  });

  // Create Stripe checkout session for subscription
  app.post("/api/billing/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { planCode, billingPeriod } = req.body;
      if (!planCode) {
        return res.status(400).json({ message: "Plan code is required" });
      }

      const org = await storage.getOrganization(user.organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get plan
      const plan = await storage.getPlanByCode(planCode);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      // Determine billing interval and price
      const isAnnual = billingPeriod === "annual";
      const interval = isAnnual ? "year" : "month";
      
      // Get effective pricing based on organization's country
      const pricing = await subscriptionService.getEffectivePricing(
        plan.id,
        org.countryCode || "GB"
      );

      // Use annual price if available and annual billing is selected, otherwise use monthly
      let unitAmount = pricing.monthlyPrice;
      if (isAnnual && plan.annualPriceGbp) {
        // Convert annual price to minor units (it's already in pence)
        unitAmount = plan.annualPriceGbp;
      } else if (isAnnual && !plan.annualPriceGbp) {
        // Fallback: calculate annual from monthly if no annual price set
        unitAmount = pricing.monthlyPrice * 12;
      }

      // Create or get Stripe customer
      let stripeCustomerId = org.stripeCustomerId;
      if (!stripeCustomerId) {
        const stripe = await getUncachableStripeClient();
        const customer = await stripe.customers.create({
          email: user.email,
          name: org.name,
          metadata: {
            organizationId: org.id,
            countryCode: org.countryCode || "GB",
          },
        });
        stripeCustomerId = customer.id;
        await storage.updateOrganizationStripe(org.id, stripeCustomerId, "inactive");
      }

      // Create checkout session
      const baseUrl = getBaseUrl(req);
      
      const successUrl = `${baseUrl}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/billing?canceled=true`;
      
      console.log(`[Subscription Checkout] Creating session with:`, {
        successUrl,
        cancelUrl,
        planCode,
        billingPeriod: interval,
        unitAmount,
        organizationId: org.id
      });
      
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: "subscription",
        line_items: [
          {
            price_data: {
              currency: pricing.currency.toLowerCase(),
              product_data: {
                name: plan.name,
                description: `${pricing.includedCredits} inspection credits per month`,
              },
              recurring: {
                interval: interval as "month" | "year",
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          organizationId: org.id,
          planId: plan.id,
          planCode: plan.code,
          includedCredits: pricing.includedCredits.toString(),
          billingPeriod: interval,
        },
      });

      console.log(`[Subscription Checkout] Session created:`, {
        sessionId: session.id,
        checkoutUrl: session.url
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      const errorMessage = error.message || "Unknown error";
      const errorDetails = error.type ? `Stripe ${error.type}: ${errorMessage}` : errorMessage;
      res.status(500).json({ 
        message: "Failed to create checkout session", 
        error: errorDetails,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

  // Create Stripe customer portal session
  app.post("/api/billing/portal", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const org = await storage.getOrganization(user.organizationId);
      if (!org?.stripeCustomerId) {
        return res.status(400).json({ message: "No active Stripe customer" });
      }

      const baseUrl = getBaseUrl(req);
      
      const stripe = await getUncachableStripeClient();
      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripeCustomerId,
        return_url: `${baseUrl}/billing`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: "Failed to create portal session", error: error.message });
    }
  });

  // Process completed checkout session (fallback for when webhooks don't fire)
  app.post("/api/billing/process-session", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
      }

      console.log(`[Process Session] Retrieving session ${sessionId} for org ${user.organizationId}`);

      // Retrieve the session from Stripe
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      // Check if we're in test mode (test keys start with sk_test_)
      const secretKey = await getStripeSecretKey();
      const isTestMode = secretKey.startsWith('sk_test_');

      console.log(`[Process Session] Test mode: ${isTestMode}, Payment status: ${session.payment_status}, Subscription: ${session.subscription || 'none'}`);

      // Verify the session belongs to this organization
      if (session.metadata?.organizationId !== user.organizationId) {
        console.error(`[Process Session] SECURITY: Session org mismatch - Session org: ${session.metadata?.organizationId}, User org: ${user.organizationId}`);
        return res.status(403).json({ message: "Session does not belong to your organization" });
      }

      // In test mode, allow processing even if payment_status isn't "paid"
      // In production, require payment_status to be "paid"
      if (!isTestMode && session.payment_status !== "paid") {
        console.log(`[Process Session] Payment not completed (non-test mode). Status: ${session.payment_status}`);
        return res.status(400).json({ message: "Payment not completed", status: session.payment_status });
      }

      if (isTestMode && session.payment_status !== "paid") {
        console.log(`[Process Session] TEST MODE: Processing despite payment_status: ${session.payment_status}`);
      }

      const { organizationId, planId, includedCredits, topupOrderId, packSize, billingPeriod } = session.metadata || {};

      // CRITICAL SECURITY CHECK: Double-verify the organizationId in metadata matches the user's org
      if (organizationId !== user.organizationId) {
        console.error(`[Process Session] SECURITY: Metadata org mismatch - Metadata org: ${organizationId}, User org: ${user.organizationId}`);
        return res.status(403).json({ message: "Session metadata does not match your organization" });
      }

      console.log(`[Process Session] Processing session:`, {
        sessionId,
        mode: session.mode,
        topupOrderId,
        planId,
        includedCredits,
        packSize,
        billingPeriod,
        verifiedOrganizationId: organizationId,
        metadata: session.metadata
      });

      // Validate metadata
      if (!planId && !topupOrderId) {
        console.error(`[Process Session] Missing required metadata: planId=${planId}, topupOrderId=${topupOrderId}`);
        return res.status(400).json({ message: "Session metadata is incomplete. Missing planId or topupOrderId." });
      }

      // Check if this is a top-up payment (one-time) vs subscription
      if (topupOrderId && packSize) {
        // Check if already processed
        const existingOrder = await storage.getTopupOrder(topupOrderId);
        if (existingOrder && existingOrder.status === "paid") {
          console.log(`[Process Session] Top-up already processed: ${topupOrderId}`);
          return res.json({ message: "Already processed", processed: true });
        }

        // CRITICAL SECURITY CHECK: Verify the top-up order belongs to this organization
        if (existingOrder && existingOrder.organizationId !== user.organizationId) {
          console.error(`[Process Session] SECURITY: Top-up order org mismatch - Order org: ${existingOrder.organizationId}, User org: ${user.organizationId}`);
          return res.status(403).json({ message: "Top-up order does not belong to your organization" });
        }

        if (!existingOrder) {
          console.error(`[Process Session] Top-up order not found: ${topupOrderId}`);
          return res.status(404).json({ message: "Top-up order not found" });
        }

        // Handle top-up payment
        console.log(`[Process Session] Processing top-up of ${packSize} credits for verified org ${user.organizationId}`);
        
        await storage.updateTopupOrder(topupOrderId, {
          status: "paid" as any,
        });

        // Grant credits to the VERIFIED organization (user.organizationId) not the metadata
        const { subscriptionService: subService } = await import("./subscriptionService");
        await subService.grantCredits(
          user.organizationId,
          parseInt(packSize),
          "topup",
          undefined,
          { topupOrderId, adminNotes: `Stripe session: ${sessionId}`, createdBy: user.id }
        );

        console.log(`[Process Session] Granted ${packSize} credits to verified org ${user.organizationId}`);
        return res.json({ message: "Credits granted successfully", processed: true });
      } 
      
      // Handle subscription payment
      if (planId) {
        try {
          // Check if subscription already exists by organization (prevent duplicates)
          const existingOrgSubscription = await storage.getSubscriptionByOrganization(user.organizationId);
          if (existingOrgSubscription) {
            console.log(`[Process Session] Organization already has subscription, skipping duplicate`);
            return res.json({ message: "Organization already has active subscription", processed: true, alreadyProcessed: true });
          }

          // Handle subscription ID - might not exist in test mode
          let subscriptionId = session.subscription as string | null;
          let subscription: any = null;

          if (subscriptionId) {
            // Check if subscription already exists by Stripe subscription ID
            const existingSubscription = await storage.getSubscriptionByStripeId(subscriptionId);
            if (existingSubscription) {
              console.log(`[Process Session] Subscription already exists: ${subscriptionId}`);
              return res.json({ message: "Subscription already activated", processed: true, alreadyProcessed: true });
            }

            // Try to retrieve subscription from Stripe
            try {
              subscription = await stripe.subscriptions.retrieve(subscriptionId);
              console.log(`[Process Session] Retrieved subscription from Stripe: ${subscriptionId}`);
            } catch (error: any) {
              console.warn(`[Process Session] Could not retrieve subscription ${subscriptionId}: ${error.message}`);
              if (!isTestMode) {
                throw new Error(`Failed to retrieve subscription: ${error.message}`);
              }
              // In test mode, continue without subscription object
              console.log(`[Process Session] TEST MODE: Continuing without Stripe subscription object`);
            }
          } else if (isTestMode) {
            // In test mode, create a mock subscription ID if none exists
            subscriptionId = `sub_test_${Date.now()}_${user.organizationId}`;
            console.log(`[Process Session] TEST MODE: Using mock subscription ID: ${subscriptionId}`);
          } else {
            return res.status(400).json({ message: "No subscription found in session" });
          }

          console.log(`[Process Session] Creating subscription from session for verified org ${user.organizationId}${isTestMode ? " (TEST MODE)" : ""}`);

          // Update organization with Stripe customer ID (use VERIFIED org)
          if (session.customer) {
            try {
              await storage.updateOrganizationStripe(user.organizationId, session.customer as string, "active");
            } catch (error: any) {
              console.warn(`[Process Session] Could not update organization Stripe: ${error.message}`);
            }
          }
          
          // Get plan details
          const plan = await storage.getPlan(planId);
          if (!plan) {
            throw new Error(`Plan not found: ${planId}`);
          }

          // Get organization for pricing
          const org = await storage.getOrganization(user.organizationId);
          let pricing: any = null;
          if (org) {
            try {
              const { subscriptionService: subService } = await import("./subscriptionService");
              pricing = await subService.getEffectivePricing(plan.id, org.countryCode || "GB");
            } catch (error: any) {
              console.warn(`[Process Session] Could not get pricing: ${error.message}, using plan defaults`);
            }
          }

          // Calculate period dates
          const now = new Date();
          const interval = billingPeriod || "month";
          
          // Helper function to safely create Date from Stripe timestamp
          const safeDateFromTimestamp = (timestamp: any, fallback: Date): Date => {
            if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
              return fallback;
            }
            const date = new Date(timestamp * 1000);
            return isNaN(date.getTime()) ? fallback : date;
          };
          
          const periodStart = subscription 
            ? safeDateFromTimestamp((subscription as any).current_period_start, now)
            : now;
          const periodEnd = subscription
            ? safeDateFromTimestamp((subscription as any).current_period_end, 
                new Date(now.getTime() + (interval === "year" ? 365 : 30) * 24 * 60 * 60 * 1000))
            : new Date(now.getTime() + (interval === "year" ? 365 : 30) * 24 * 60 * 60 * 1000);
          const billingCycleAnchor = subscription
            ? safeDateFromTimestamp((subscription as any).billing_cycle_anchor, now)
            : now;

          // Get price from subscription or plan
          const monthlyPrice = subscription?.items?.data?.[0]?.price?.unit_amount 
            || (pricing?.monthlyPrice) 
            || plan.monthlyPriceGbp;

          // Validate includedCredits
          const creditsToGrant = parseInt(includedCredits || "0");
          if (!creditsToGrant || isNaN(creditsToGrant)) {
            throw new Error(`Invalid includedCredits: ${includedCredits}`);
          }

          // Create subscription record (use VERIFIED org)
          console.log(`[Process Session] Creating subscription with data:`, {
            organizationId: user.organizationId,
            planId: plan.id,
            planCode: plan.code,
            planName: plan.name,
            monthlyPrice: monthlyPrice,
            includedCredits: creditsToGrant,
            stripeSubscriptionId: subscriptionId,
            status: (subscription?.status || "active")
          });
          
          const createdSubscription = await storage.createSubscription({
            organizationId: user.organizationId,
            planSnapshotJson: {
              planId: plan.id,
              planCode: plan.code,
              planName: plan.name,
              monthlyPrice: monthlyPrice,
              includedCredits: creditsToGrant,
              currency: (subscription?.currency || pricing?.currency || "GBP").toUpperCase(),
            },
            stripeSubscriptionId: subscriptionId,
            billingCycleAnchor: billingCycleAnchor,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            status: (subscription?.status || "active") as any,
            cancelAtPeriodEnd: subscription?.cancel_at_period_end || false,
          });

          console.log(`[Process Session] Subscription created successfully:`, {
            id: createdSubscription.id,
            organizationId: createdSubscription.organizationId,
            planName: createdSubscription.planSnapshotJson?.planName,
            status: createdSubscription.status
          });

          // Small delay to ensure database transaction is committed
          await new Promise(resolve => setTimeout(resolve, 100));

          // Verify subscription was saved by fetching it back
          const verifySubscription = await storage.getSubscriptionByOrganization(user.organizationId);
          if (!verifySubscription) {
            console.error(`[Process Session] ERROR: Subscription was created but cannot be retrieved!`);
            console.error(`[Process Session] Created subscription ID: ${createdSubscription.id}`);
            console.error(`[Process Session] Organization ID: ${user.organizationId}`);
            throw new Error("Subscription was created but cannot be retrieved");
          }
          console.log(`[Process Session] Verified subscription exists in database:`, {
            id: verifySubscription.id,
            organizationId: verifySubscription.organizationId,
            planName: verifySubscription.planSnapshotJson?.planName,
            status: verifySubscription.status
          });

          // Grant initial credits (use VERIFIED org)
          try {
            const { subscriptionService: subService } = await import("./subscriptionService");
            await subService.grantCredits(
              user.organizationId,
              creditsToGrant,
              "plan_inclusion",
              periodEnd,
              { subscriptionId: subscriptionId, createdBy: user.id, adminNotes: isTestMode ? "TEST MODE - No payment charged" : undefined }
            );
            console.log(`[Process Session] Granted ${creditsToGrant} credits successfully`);
          } catch (creditError: any) {
            console.error(`[Process Session] Error granting credits:`, creditError);
            // Don't fail the whole request if credits fail - subscription is already created
            console.warn(`[Process Session] Continuing despite credit grant error`);
          }

          console.log(`[Process Session] Created subscription and granted ${creditsToGrant} credits to verified org ${user.organizationId}${isTestMode ? " (TEST MODE)" : ""}`);
          return res.json({ message: "Subscription activated successfully", processed: true });
        } catch (subscriptionError: any) {
          console.error(`[Process Session] Error in subscription processing:`, subscriptionError);
          console.error(`[Process Session] Subscription error stack:`, subscriptionError.stack);
          throw subscriptionError; // Re-throw to be caught by outer catch
        }
      }

      res.json({ message: "Session processed", processed: false });
    } catch (error: any) {
      console.error("[Process Session] Error processing session:", error);
      console.error("[Process Session] Error stack:", error.stack);
      console.error("[Process Session] Error details:", {
        message: error.message,
        type: error.type,
        code: error.code,
        statusCode: error.statusCode
      });
      res.status(500).json({ 
        message: "Failed to process session", 
        error: error.message,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

  // Stripe webhook handler
  app.post("/api/billing/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    
    let event: any;
    try {
      // In production, verify the webhook signature
      // For now, we'll accept the event as-is
      event = req.body;

      console.log(`[Stripe Webhook] Received event: ${event.type}`);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const { organizationId, planId, includedCredits, topupOrderId, packSize } = session.metadata;

          console.log(`[Stripe Webhook] Checkout completed:`, {
            organizationId,
            planId,
            topupOrderId,
            packSize,
            sessionId: session.id,
            mode: session.mode
          });

          // CRITICAL SECURITY CHECK: Verify organization exists
          const org = await storage.getOrganization(organizationId);
          if (!org) {
            console.error(`[Stripe Webhook] SECURITY: Organization not found: ${organizationId}`);
            break;
          }

          // Check if this is a top-up payment (one-time) vs subscription
          if (topupOrderId && packSize) {
            // CRITICAL SECURITY CHECK: Verify top-up order belongs to this organization
            const topupOrder = await storage.getTopupOrder(topupOrderId);
            if (!topupOrder) {
              console.error(`[Stripe Webhook] SECURITY: Top-up order not found: ${topupOrderId}`);
              break;
            }
            if (topupOrder.organizationId !== organizationId) {
              console.error(`[Stripe Webhook] SECURITY: Top-up order org mismatch - Order org: ${topupOrder.organizationId}, Session org: ${organizationId}`);
              break;
            }

            // Check if already processed
            if (topupOrder.status === "paid") {
              console.log(`[Stripe Webhook] Top-up already processed: ${topupOrderId}`);
              break;
            }

            // Handle top-up payment
            console.log(`[Stripe Webhook] Processing top-up of ${packSize} credits for verified org: ${organizationId}`);
            
            // Update top-up order status
            await storage.updateTopupOrder(topupOrderId, {
              status: "paid" as any,
            });

            // Grant credits to VERIFIED organization
            await subscriptionService.grantCredits(
              organizationId,
              parseInt(packSize),
              "topup",
              undefined,
              { topupOrderId, adminNotes: `Stripe webhook session: ${session.id}` }
            );

            console.log(`[Stripe Webhook] Granted ${packSize} credits to verified org ${organizationId} via top-up`);
            break;
          }

          // Handle subscription payment
          if (session.subscription && planId) {
            // CRITICAL SECURITY CHECK: Verify customer matches organization
            if (session.customer !== org.stripeCustomerId) {
              console.error(`[Stripe Webhook] SECURITY: Customer mismatch - Session customer: ${session.customer}, Org customer: ${org.stripeCustomerId}`);
              // Update org with new customer ID if it's empty
              if (!org.stripeCustomerId) {
                console.log(`[Stripe Webhook] Updating org ${organizationId} with customer ${session.customer}`);
                await storage.updateOrganizationStripe(organizationId, session.customer, "active");
              } else {
                break; // Reject if customer mismatch and org already has a customer
              }
            }

            // Check if subscription already exists
            const existingSubscription = await storage.getSubscriptionByStripeId(session.subscription);
            if (existingSubscription) {
              console.log(`[Stripe Webhook] Subscription already exists: ${session.subscription}`);
              break;
            }

            const stripe = await getUncachableStripeClient();
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            const plan = await storage.getPlan(planId);
            
            if (plan) {
              console.log(`[Stripe Webhook] Creating subscription for verified org ${organizationId}`);

              // Helper function to safely create Date from Stripe timestamp
              const safeDateFromTimestamp = (timestamp: any, fallback: Date): Date => {
                if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
                  return fallback;
                }
                const date = new Date(timestamp * 1000);
                return isNaN(date.getTime()) ? fallback : date;
              };
              
              const now = new Date();
              const defaultPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days default
              
              await storage.createSubscription({
                organizationId,
                planSnapshotJson: {
                  planId: plan.id,
                  planCode: plan.code,
                  planName: plan.name,
                  monthlyPrice: plan.monthlyPriceGbp,
                  includedCredits: parseInt(includedCredits),
                  currency: (subscription as any).currency.toUpperCase(),
                },
                stripeSubscriptionId: (subscription as any).id,
                billingCycleAnchor: safeDateFromTimestamp((subscription as any).billing_cycle_anchor, now),
                currentPeriodStart: safeDateFromTimestamp((subscription as any).current_period_start, now),
                currentPeriodEnd: safeDateFromTimestamp((subscription as any).current_period_end, defaultPeriodEnd),
                status: (subscription as any).status as any,
                cancelAtPeriodEnd: (subscription as any).cancel_at_period_end || false,
              });

              // Grant initial credits to VERIFIED organization
              await subscriptionService.grantCredits(
                organizationId,
                parseInt(includedCredits),
                "plan_inclusion",
                new Date((subscription as any).current_period_end * 1000),
                { subscriptionId: (subscription as any).id }
              );

              console.log(`[Stripe Webhook] Granted ${includedCredits} credits to verified org ${organizationId}`);
            }
          }
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object;
          
          if (invoice.subscription) {
            const stripe = await getUncachableStripeClient();
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            const dbSubscription = await storage.getSubscriptionByStripeId(subscription.id);

            if (dbSubscription) {
              // Helper function to safely create Date from Stripe timestamp
              const safeDateFromTimestamp = (timestamp: any, fallback: Date): Date => {
                if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
                  return fallback;
                }
                const date = new Date(timestamp * 1000);
                return isNaN(date.getTime()) ? fallback : date;
              };
              
              const now = new Date();
              const defaultPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days default
              
              // Update subscription period
              await storage.updateSubscription(dbSubscription.id, {
                currentPeriodStart: safeDateFromTimestamp((subscription as any).current_period_start, dbSubscription.currentPeriodStart || now),
                currentPeriodEnd: safeDateFromTimestamp((subscription as any).current_period_end, dbSubscription.currentPeriodEnd || defaultPeriodEnd),
                status: (subscription as any).status as any,
              });

              // Process rollover and grant new cycle credits
              await subscriptionService.processRollover(
                dbSubscription.organizationId,
                new Date((subscription as any).current_period_end * 1000)
              );

              // Grant new cycle credits
              await subscriptionService.grantCredits(
                dbSubscription.organizationId,
                dbSubscription.planSnapshotJson.includedCredits,
                "plan_inclusion",
                new Date((subscription as any).current_period_end * 1000),
                { subscriptionId: (subscription as any).id }
              );

              console.log(`[Stripe Webhook] New billing cycle for org ${dbSubscription.organizationId}`);
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object;
          
          if (invoice.subscription) {
            const stripe = await getUncachableStripeClient();
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            const dbSubscription = await storage.getSubscriptionByStripeId(subscription.id);

            if (dbSubscription) {
              await storage.updateSubscription(dbSubscription.id, {
                status: "inactive" as any,
              });
              
              console.log(`[Stripe Webhook] Payment failed for org ${dbSubscription.organizationId}`);
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const dbSubscription = await storage.getSubscriptionByStripeId(subscription.id);

          if (dbSubscription) {
            await storage.cancelSubscription(dbSubscription.id);
            console.log(`[Stripe Webhook] Subscription canceled for org ${dbSubscription.organizationId}`);
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error(`[Stripe Webhook] Error processing webhook:`, error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get credit balance
  app.get("/api/credits/balance", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const balance = await storage.getCreditBalance(user.organizationId);
      
      // Get ledger to calculate consumed credits
      const ledger = await storage.getCreditLedgerByOrganization(user.organizationId, 10000);
      
      let consumed = 0;
      let expired = 0;
      
      for (const entry of ledger) {
        if (entry.quantity < 0) {
          // Negative quantities are consumption
          consumed += Math.abs(entry.quantity);
        }
      }
      
      // Get expired batches
      const expiredBatches = await db
        .select()
        .from(creditBatches)
        .where(
          and(
            eq(creditBatches.organizationId, user.organizationId),
            lt(creditBatches.expiresAt, new Date()),
            gt(creditBatches.remainingQuantity, 0)
          )
        );
      
      for (const batch of expiredBatches) {
        expired += batch.remainingQuantity;
      }
      
      // Return in the format the frontend expects
      res.json({
        available: balance.total,
        consumed,
        expired
      });
    } catch (error: any) {
      console.error("Error fetching credit balance:", error);
      res.status(500).json({ message: "Failed to fetch credit balance" });
    }
  });

  // Get credit ledger
  app.get("/api/credits/ledger", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const ledger = await storage.getCreditLedgerByOrganization(user.organizationId, limit);
      res.json(ledger);
    } catch (error: any) {
      console.error("Error fetching credit ledger:", error);
      res.status(500).json({ message: "Failed to fetch credit ledger" });
    }
  });

  // Create top-up checkout session
  app.post("/api/credits/topup/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { packSize } = req.body;
      if (!packSize || ![100, 250, 500, 1000].includes(packSize)) {
        return res.status(400).json({ message: "Invalid pack size. Must be 100, 250, 500, or 1000" });
      }

      const org = await storage.getOrganization(user.organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      // Get pricing based on pack size (pence per credit)
      const pricingTiers: Record<number, number> = {
        100: 400,   // £4.00 per credit
        250: 300,   // £3.00 per credit
        500: 200,   // £2.00 per credit
        1000: 150,  // £1.50 per credit
      };
      const unitPrice = pricingTiers[packSize];
      const totalPrice = packSize * unitPrice;
      const currency = "GBP"; // Could be determined by country

      // Create top-up order
      const order = await storage.createTopupOrder({
        organizationId: org.id,
        packSize,
        currency: currency as any,
        unitPriceMinorUnits: unitPrice,
        totalPriceMinorUnits: totalPrice,
        status: "pending" as any,
      });

      // Create Stripe checkout session
      const baseUrl = getBaseUrl(req);
      
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.create({
        customer: org.stripeCustomerId || undefined,
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `${packSize} Inspection Credits`,
                description: "Credit top-up for inspections",
              },
              unit_amount: totalPrice,
            },
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/billing?topup_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/billing?topup_canceled=true`,
        metadata: {
          organizationId: org.id,
          topupOrderId: order.id,
          packSize: packSize.toString(),
        },
      });

      // Update order with payment intent
      await storage.updateTopupOrder(order.id, {
        stripePaymentIntentId: session.payment_intent as string,
      });

      res.json({ url: session.url, orderId: order.id });
    } catch (error: any) {
      console.error("Error creating topup checkout:", error);
      res.status(500).json({ message: "Failed to create topup checkout", error: error.message });
    }
  });

  // Admin: Grant credits
  app.post("/api/admin/credits/grant", isAuthenticated, requireRole("owner"), async (req: any, res) => {
    try {
      const { organizationId, quantity, reason } = req.body;
      const user = await storage.getUser(req.user.id);
      
      if (!organizationId || !quantity || quantity <= 0) {
        return res.status(400).json({ message: "Invalid request" });
      }

      await subscriptionService.grantCredits(
        organizationId,
        quantity,
        "admin_grant",
        undefined,
        { adminNotes: reason || "Admin grant", createdBy: user?.id }
      );

      res.json({ success: true, granted: quantity });
    } catch (error: any) {
      console.error("Error granting credits:", error);
      res.status(500).json({ message: "Failed to grant credits", error: error.message });
    }
  });

  // ==================== ECO-ADMIN ROUTES (Country Pricing Configuration) ====================

  // Get all country pricing overrides
  app.get("/api/admin/country-pricing", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const overrides = await storage.getAllCountryPricingOverrides();
      res.json(overrides);
    } catch (error: any) {
      console.error("Error fetching country pricing:", error);
      res.status(500).json({ message: "Failed to fetch country pricing" });
    }
  });

  // Create country pricing override
  app.post("/api/admin/country-pricing", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate request body
      const validated = insertCountryPricingOverrideSchema.parse(req.body);
      const override = await storage.createCountryPricingOverride(validated);
      res.json(override);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid country pricing data", errors: error.errors });
      }
      console.error("Error creating country pricing:", error);
      res.status(500).json({ message: "Failed to create country pricing", error: error.message });
    }
  });

  // Update country pricing override
  app.patch("/api/admin/country-pricing/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate request body
      const validated = insertCountryPricingOverrideSchema.partial().parse(req.body);
      const { id } = req.params;
      const override = await storage.updateCountryPricingOverride(id, validated);
      res.json(override);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid country pricing data", errors: error.errors });
      }
      console.error("Error updating country pricing:", error);
      res.status(500).json({ message: "Failed to update country pricing", error: error.message });
    }
  });

  // Delete country pricing override
  app.delete("/api/admin/country-pricing/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { id } = req.params;
      await storage.deleteCountryPricingOverride(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting country pricing:", error);
      res.status(500).json({ message: "Failed to delete country pricing", error: error.message });
    }
  });

  // ==================== SUBSCRIPTION PLAN ROUTES (Eco-Admin) ====================

  // Get all plans
  app.get("/api/admin/plans", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const plans = await storage.getPlans();
      res.json(plans);
    } catch (error: any) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Get active plans
  app.get("/api/admin/plans/active", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const plans = await storage.getActivePlans();
      res.json(plans);
    } catch (error: any) {
      console.error("Error fetching active plans:", error);
      res.status(500).json({ message: "Failed to fetch active plans" });
    }
  });

  // Create new plan
  app.post("/api/admin/plans", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate request body
      const validated = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(validated);
      res.json(plan);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid plan data", errors: error.errors });
      }
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Failed to create plan", error: error.message });
    }
  });

  // Update plan
  app.patch("/api/admin/plans/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate request body
      const validated = insertPlanSchema.partial().parse(req.body);
      const { id } = req.params;
      const plan = await storage.updatePlan(id, validated);
      res.json(plan);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid plan data", errors: error.errors });
      }
      console.error("Error updating plan:", error);
      res.status(500).json({ message: "Failed to update plan", error: error.message });
    }
  });

  // ==================== CREDIT BUNDLE ROUTES (Eco-Admin) ====================

  // Get all credit bundles
  app.get("/api/admin/bundles", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const bundles = await storage.getCreditBundles();
      res.json(bundles);
    } catch (error: any) {
      console.error("Error fetching bundles:", error);
      res.status(500).json({ message: "Failed to fetch bundles" });
    }
  });

  // Get active credit bundles
  app.get("/api/admin/bundles/active", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const bundles = await storage.getActiveCreditBundles();
      res.json(bundles);
    } catch (error: any) {
      console.error("Error fetching active bundles:", error);
      res.status(500).json({ message: "Failed to fetch active bundles" });
    }
  });

  // Create new credit bundle
  app.post("/api/admin/bundles", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate request body
      const validated = insertCreditBundleSchema.parse(req.body);
      const bundle = await storage.createCreditBundle(validated);
      res.json(bundle);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid bundle data", errors: error.errors });
      }
      console.error("Error creating bundle:", error);
      res.status(500).json({ message: "Failed to create bundle", error: error.message });
    }
  });

  // Update credit bundle
  app.patch("/api/admin/bundles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate request body
      const validated = insertCreditBundleSchema.partial().parse(req.body);
      const { id } = req.params;
      const bundle = await storage.updateCreditBundle(id, validated);
      res.json(bundle);
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid bundle data", errors: error.errors });
      }
      console.error("Error updating bundle:", error);
      res.status(500).json({ message: "Failed to update bundle", error: error.message });
    }
  });

  // Delete credit bundle
  app.delete("/api/admin/bundles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { id } = req.params;
      await storage.deleteCreditBundle(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting bundle:", error);
      res.status(500).json({ message: "Failed to delete bundle", error: error.message });
    }
  });

  // Get current organization subscription
  app.get("/api/billing/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      console.log(`[Get Subscription] Fetching subscription for org: ${user.organizationId}, user: ${user.id}`);
      
      // Get all subscriptions for this org to debug
      const allSubscriptions = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, user.organizationId));
      
      console.log(`[Get Subscription] Found ${allSubscriptions.length} subscription(s) for org ${user.organizationId}:`, 
        allSubscriptions.map(s => ({ id: s.id, status: s.status, planName: s.planSnapshotJson?.planName }))
      );
      
      const subscription = await storage.getSubscriptionByOrganization(user.organizationId);
      
      if (subscription) {
        console.log(`[Get Subscription] Returning subscription:`, {
          id: subscription.id,
          planName: subscription.planSnapshotJson?.planName,
          status: subscription.status,
          organizationId: subscription.organizationId,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd
        });
      } else {
        console.log(`[Get Subscription] No subscription found for org: ${user.organizationId}`);
        console.log(`[Get Subscription] All subscriptions in DB for this org:`, allSubscriptions);
      }
      
      res.json(subscription || null);
    } catch (error: any) {
      console.error("[Get Subscription] Error fetching subscription:", error);
      console.error("[Get Subscription] Error stack:", error.stack);
      res.status(500).json({ message: "Failed to fetch subscription", error: error.message });
    }
  });

  // Get aggregate credit balance across all organizations for normalized email (detects duplicates)
  app.get("/api/billing/aggregate-credits", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId || !user.email) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Get all organizations associated with this normalized email
      const orgs = await storage.getOrganizationsByNormalizedEmail(user.email);
      
      // Get credit balances for each organization
      const orgBalances = await Promise.all(
        orgs.map(async (org) => {
          const balance = await storage.getCreditBalance(org.organizationId);
          return {
            organizationId: org.organizationId,
            organizationName: org.organizationName,
            userRole: org.userRole,
            credits: balance.current,
            rolled: balance.rolled,
            total: balance.total,
          };
        })
      );

      // Calculate aggregate totals
      const totalCredits = orgBalances.reduce((sum, org) => sum + org.credits, 0);
      const totalRolled = orgBalances.reduce((sum, org) => sum + org.rolled, 0);
      const grandTotal = orgBalances.reduce((sum, org) => sum + org.total, 0);
      
      // Find current org balance
      const currentOrgBalance = orgBalances.find(org => org.organizationId === user.organizationId);
      
      res.json({
        primaryOrganizationCredits: currentOrgBalance?.credits || 0,
        duplicateOrganizations: orgBalances.filter(org => org.organizationId !== user.organizationId),
        allOrganizations: orgBalances,
        totalCredits,
        totalRolled,
        grandTotal,
        hasDuplicates: orgBalances.length > 1,
      });
    } catch (error: any) {
      console.error("Error fetching aggregate credits:", error);
      res.status(500).json({ message: "Failed to fetch aggregate credits" });
    }
  });

  // User/Contact endpoints for team management (restricted)
  
  // Get users for team management (admin/owner only)
  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can view users
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const users = await storage.getUsersByOrganization(user.organizationId);
      
      // Return minimal user data for team selection
      const sanitizedUsers = users.map(u => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
      }));
      
      res.json(sanitizedUsers);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get contacts for team management (admin/owner only)
  app.get("/api/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can view contacts
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const contacts = await storage.getContactsByOrganization(user.organizationId);
      
      // Return minimal contact data for team selection
      const sanitizedContacts = contacts.map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        type: c.type,
      }));
      
      res.json(sanitizedContacts);
    } catch (error: any) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  // Team Management Routes
  
  // Get all teams for organization
  app.get("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can view teams
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const teams = await storage.getTeamsByOrganization(user.organizationId);
      res.json(teams);
    } catch (error: any) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Get single team
  app.get("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can view teams
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { id } = req.params;
      const team = await storage.getTeam(id);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(team);
    } catch (error: any) {
      console.error("Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  // Create team
  // Create team with members and categories (atomic transaction)
  app.post("/api/teams/full", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can create teams
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate request body
      const bodySchema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        email: z.string().email(),
        isActive: z.boolean().optional(),
        userIds: z.array(z.string()).optional(),
        contactIds: z.array(z.string()).optional(),
        categories: z.array(z.string()).optional(),
      });

      const validationResult = bodySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: validationResult.error.errors,
        });
      }

      const { name, description, email, isActive, userIds, contactIds, categories } = validationResult.data;

      // Create team with members and categories in a single transaction
      try {
        const result = await db.transaction(async (tx) => {
          // 1. Create team
          const [createdTeam] = await tx.insert(teams).values({
            organizationId: user.organizationId,
            name,
            description,
            email,
            isActive: isActive ?? true,
          }).returning();

          // 2. Add user members
          if (userIds && Array.isArray(userIds) && userIds.length > 0) {
            await tx.insert(teamMembers).values(
              userIds.map(userId => ({
                teamId: createdTeam.id,
                userId,
                contactId: null,
                role: 'member' as const,
              }))
            );
          }

          // 3. Add contractor members
          if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
            await tx.insert(teamMembers).values(
              contactIds.map(contactId => ({
                teamId: createdTeam.id,
                userId: null,
                contactId,
                role: 'contractor' as const,
              }))
            );
          }

          // 4. Add categories
          if (categories && Array.isArray(categories) && categories.length > 0) {
            await tx.insert(teamCategories).values(
              categories.map(category => ({
                teamId: createdTeam.id,
                category,
              }))
            );
          }

          // Return created team with counts
          const finalMembers = await tx
            .select()
            .from(teamMembers)
            .where(eq(teamMembers.teamId, createdTeam.id));

          const finalCategories = await tx
            .select()
            .from(teamCategories)
            .where(eq(teamCategories.teamId, createdTeam.id));

          return {
            ...createdTeam,
            memberCount: finalMembers.length,
            categories: finalCategories.map(c => c.category),
          };
        });

        res.status(201).json(result);
      } catch (error: any) {
        // Transaction automatically rolled back on error
        throw error;
      }
    } catch (error: any) {
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Failed to create team", error: error.message });
    }
  });

  // Simple team creation (without members/categories)
  app.post("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can create teams
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { name, description, email, isActive } = req.body;

      if (!name || !email) {
        return res.status(400).json({ message: "Name and email are required" });
      }

      const team = await storage.createTeam({
        organizationId: user.organizationId,
        name,
        description,
        email,
        isActive: isActive ?? true,
      });

      res.status(201).json(team);
    } catch (error: any) {
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // Update team
  app.patch("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can update teams
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { id } = req.params;
      const team = await storage.getTeam(id);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { name, description, email, isActive } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (email !== undefined) updates.email = email;
      if (isActive !== undefined) updates.isActive = isActive;

      const updatedTeam = await storage.updateTeam(id, updates);
      res.json(updatedTeam);
    } catch (error: any) {
      console.error("Error updating team:", error);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Update team with members and categories (server-side batched)
  app.patch("/api/teams/:id/full", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can update teams
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { id } = req.params;
      
      // Validate request body
      const bodySchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        email: z.string().email().optional(),
        isActive: z.boolean().optional(),
        userIds: z.array(z.string()).optional(),
        contactIds: z.array(z.string()).optional(),
        categories: z.array(z.string()).optional(),
      });
      
      const validationResult = bodySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: validationResult.error.errors 
        });
      }
      
      const { name, description, email, isActive, userIds, contactIds, categories } = validationResult.data;

      const team = await storage.getTeam(id);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Begin database transaction for atomic updates
      try {
        const result = await db.transaction(async (tx) => {
          // 1. Update team details
          const teamUpdates: any = {};
          if (name !== undefined) teamUpdates.name = name;
          if (description !== undefined) teamUpdates.description = description;
          if (email !== undefined) teamUpdates.email = email;
          if (isActive !== undefined) teamUpdates.isActive = isActive;
          
          const [updatedTeam] = await tx
            .update(teams)
            .set(teamUpdates)
            .where(eq(teams.id, id))
            .returning();

          // 2. Update members - delete all and recreate
          await tx.delete(teamMembers).where(eq(teamMembers.teamId, id));

          // Add new user members
          if (userIds && Array.isArray(userIds) && userIds.length > 0) {
            await tx.insert(teamMembers).values(
              userIds.map(userId => ({
                teamId: id,
                userId,
                contactId: null,
                role: 'member' as const,
              }))
            );
          }

          // Add new contractor members
          if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
            await tx.insert(teamMembers).values(
              contactIds.map(contactId => ({
                teamId: id,
                userId: null,
                contactId,
                role: 'contractor' as const,
              }))
            );
          }

          // 3. Update categories - delete all and recreate
          await tx.delete(teamCategories).where(eq(teamCategories.teamId, id));

          if (categories && Array.isArray(categories) && categories.length > 0) {
            await tx.insert(teamCategories).values(
              categories.map(category => ({
                teamId: id,
                category,
              }))
            );
          }

          // Return updated team with counts
          const finalMembers = await tx
            .select()
            .from(teamMembers)
            .where(eq(teamMembers.teamId, id));

          const finalCategories = await tx
            .select()
            .from(teamCategories)
            .where(eq(teamCategories.teamId, id));

          return {
            ...updatedTeam,
            memberCount: finalMembers.length,
            categories: finalCategories.map(c => c.category),
          };
        });

        res.json(result);
      } catch (error: any) {
        // Transaction automatically rolled back on error
        throw error;
      }
    } catch (error: any) {
      console.error("Error updating team:", error);
      res.status(500).json({ message: "Failed to update team", error: error.message });
    }
  });

  // Delete team
  app.delete("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can delete teams
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { id } = req.params;
      const team = await storage.getTeam(id);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deleteTeam(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Get team members
  app.get("/api/teams/:teamId/members", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can view team members
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { teamId } = req.params;
      const team = await storage.getTeam(teamId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const members = await storage.getTeamMembers(teamId);
      res.json(members);
    } catch (error: any) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Add team member
  app.post("/api/teams/:teamId/members", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can add team members
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { teamId } = req.params;
      const { userId, contactId, role } = req.body;

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate that exactly one of userId or contactId is provided
      if ((userId && contactId) || (!userId && !contactId)) {
        return res.status(400).json({ message: "Must provide either userId or contactId, not both" });
      }

      const member = await storage.addTeamMember({
        teamId,
        userId: userId || null,
        contactId: contactId || null,
        role: role || 'member',
      });

      res.status(201).json(member);
    } catch (error: any) {
      console.error("Error adding team member:", error);
      res.status(500).json({ message: "Failed to add team member" });
    }
  });

  // Remove team member
  app.delete("/api/teams/:teamId/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can remove team members
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { teamId, memberId } = req.params;
      const team = await storage.getTeam(teamId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.removeTeamMember(memberId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing team member:", error);
      res.status(500).json({ message: "Failed to remove team member" });
    }
  });

  // Get team categories
  app.get("/api/teams/:teamId/categories", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can view team categories
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { teamId } = req.params;
      const team = await storage.getTeam(teamId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const categories = await storage.getTeamCategories(teamId);
      res.json(categories);
    } catch (error: any) {
      console.error("Error fetching team categories:", error);
      res.status(500).json({ message: "Failed to fetch team categories" });
    }
  });

  // Add team category
  app.post("/api/teams/:teamId/categories", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can add team categories
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { teamId } = req.params;
      const { category } = req.body;

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!category) {
        return res.status(400).json({ message: "Category is required" });
      }

      const teamCategory = await storage.addTeamCategory({
        teamId,
        category,
      });

      res.status(201).json(teamCategory);
    } catch (error: any) {
      console.error("Error adding team category:", error);
      res.status(500).json({ message: "Failed to add team category" });
    }
  });

  // Remove team category
  app.delete("/api/teams/:teamId/categories/:categoryId", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      // Only admins and owners can remove team categories
      if (!['admin', 'owner'].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { teamId, categoryId } = req.params;
      const team = await storage.getTeam(teamId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Verify team belongs to user's organization
      if (team.organizationId !== user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.removeTeamCategory(categoryId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing team category:", error);
      res.status(500).json({ message: "Failed to remove team category" });
    }
  });

  // ==================== KNOWLEDGE BASE ROUTES (AI CHATBOT) ====================

  // Upload knowledge base document (admin only)
  app.post("/api/knowledge-base/documents", isAdminAuthenticated, async (req: any, res) => {
    try {
      const admin = (req.session as any).adminUser;
      const { title, fileName, fileUrl, fileType, fileSizeBytes, category, description } = req.body;

      if (!title || !fileName || !fileUrl || !fileType || !fileSizeBytes) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      console.log(`[Knowledge Base] Extracting text from ${fileName} (${fileType})`);

      const processed = await extractTextFromFile(fileUrl, fileType);

      if (processed.error) {
        console.error(`[Knowledge Base] Extraction error: ${processed.error}`);
        return res.status(400).json({ message: processed.error });
      }

      const document = await storage.createKnowledgeBaseDocument({
        title,
        fileName,
        fileUrl,
        fileType,
        fileSizeBytes,
        extractedText: processed.extractedText,
        category: category || null,
        description: description || null,
        uploadedBy: admin.id,
      });

      console.log(`[Knowledge Base] Document created: ${document.id} (${processed.extractedText.length} characters)`);
      res.status(201).json(document);
    } catch (error: any) {
      console.error("[Knowledge Base] Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Get all knowledge base documents (admin only)
  app.get("/api/knowledge-base/documents", isAdminAuthenticated, async (req: any, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const documents = await storage.getKnowledgeBaseDocuments(activeOnly);
      res.json(documents);
    } catch (error: any) {
      console.error("[Knowledge Base] Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Update knowledge base document (admin only)
  app.patch("/api/knowledge-base/documents/:id", isAdminAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const document = await storage.updateKnowledgeBaseDocument(id, updates);
      res.json(document);
    } catch (error: any) {
      console.error("[Knowledge Base] Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // Delete knowledge base document (admin only)
  app.delete("/api/knowledge-base/documents/:id", isAdminAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteKnowledgeBaseDocument(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Knowledge Base] Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // ==================== CHATBOT ROUTES ====================

  // Get user's chat conversations
  app.get("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const conversations = await storage.getChatConversationsByUser(userId);
      res.json(conversations);
    } catch (error: any) {
      console.error("[Chatbot] Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // Create new chat conversation
  app.post("/api/chat/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.organizationId) {
        return res.status(400).json({ message: "User must belong to an organization" });
      }

      const { title } = req.body;

      const conversation = await storage.createChatConversation({
        organizationId: user.organizationId,
        userId: user.id,
        title: title || "New Chat",
      });

      res.status(201).json(conversation);
    } catch (error: any) {
      console.error("[Chatbot] Error creating conversation:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Get conversation messages
  app.get("/api/chat/conversations/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(req.user.id);

      const conversation = await storage.getChatConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (conversation.userId !== user?.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const messages = await storage.getChatMessages(id);
      res.json(messages);
    } catch (error: any) {
      console.error("[Chatbot] Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Send chat message and get AI response
  app.post("/api/chat/conversations/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const user = await storage.getUser(req.user.id);

      if (!content || content.trim().length === 0) {
        return res.status(400).json({ message: "Message content is required" });
      }

      const conversation = await storage.getChatConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      if (conversation.userId !== user?.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const userMessage = await storage.createChatMessage({
        conversationId: id,
        role: "user",
        content,
        sourceDocs: [],
      });

      const documents = await storage.searchKnowledgeBase(content);
      
      let contextChunks: string[] = [];
      const usedDocIds: string[] = [];

      for (const doc of documents.slice(0, 3)) {
        if (doc.extractedText) {
          const relevantChunks = findRelevantChunks(doc.extractedText, content, 2);
          contextChunks.push(...relevantChunks);
          if (relevantChunks.length > 0) {
            usedDocIds.push(doc.id);
          }
        }
      }

      const contextText = contextChunks.length > 0
        ? `Based on the Inspect360 knowledge base:\n\n${contextChunks.join('\n\n---\n\n')}\n\n`
        : '';

      const systemPrompt = `You are an AI assistant for Inspect360, a building inspection platform. ${contextText ? 'Use the knowledge base information provided to answer questions accurately.' : 'Answer questions about Inspect360 to the best of your ability.'}`;

      const openaiClient = getOpenAI();
      const completion = await openaiClient.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextText + content },
        ],
        max_completion_tokens: 1000,
      });

      const assistantContent = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

      const assistantMessage = await storage.createChatMessage({
        conversationId: id,
        role: "assistant",
        content: assistantContent,
        sourceDocs: usedDocIds,
      });

      if (!conversation.title || conversation.title === "New Chat") {
        const titlePrompt = `Generate a short 3-5 word title for a conversation that starts with: "${content.substring(0, 100)}"`;
        const titleCompletion = await openaiClient.chat.completions.create({
          model: "gpt-5-mini",
          messages: [{ role: "user", content: titlePrompt }],
          max_completion_tokens: 20,
        });
        const title = titleCompletion.choices[0]?.message?.content?.replace(/['"]/g, '') || "Chat";
        await storage.updateChatConversation(id, { title });
      }

      res.json({ userMessage, assistantMessage });
    } catch (error: any) {
      console.error("[Chatbot] Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ==================== TENANT PORTAL ROUTES ====================

  // Tenant login (separate from main auth)
  // NOTE: This endpoint uses the same 'users' table where tenant users are created.
  // The email and password set during tenant creation (via /api/team) are used here for authentication.
  app.post("/api/tenant/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Normalize email for case-insensitive lookup
      // This looks up the user in the same 'users' table where they were created
      const normalizedEmail = email.toLowerCase().trim();
      const user = await storage.getUserByEmail(normalizedEmail);
      
      if (!user || user.role !== "tenant") {
        return res.status(401).json({ message: "Invalid credentials or not a tenant account" });
      }

      // Verify password - this is the same password that was set during tenant creation
      const isValid = await comparePasswords(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Account is deactivated. Please contact property management." });
      }

      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        // Sanitize user object - remove all sensitive fields
        const { password: _, resetToken, resetTokenExpiry, ...sanitizedUser } = user;
        res.json({ user: sanitizedUser });
      });
    } catch (error) {
      console.error("Tenant login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Get tenant's tenancy information
  app.get("/api/tenant/tenancy", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      const tenancy = await storage.getTenancyByTenantId(userId);
      if (!tenancy) {
        return res.json(null);
      }

      const property = await storage.getProperty(tenancy.propertyId);
      let block = null;
      if (property?.blockId) {
        block = await storage.getBlock(property.blockId);
      }

      res.json({ tenancy, property, block });
    } catch (error) {
      console.error("Error fetching tenant tenancy:", error);
      res.status(500).json({ message: "Failed to fetch tenancy" });
    }
  });

  // Get tenant's maintenance chat conversations
  app.get("/api/tenant/maintenance-chats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      const chats = await storage.getTenantMaintenanceChats(userId);
      res.json(chats);
    } catch (error) {
      console.error("Error fetching maintenance chats:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  // Get specific maintenance chat with messages
  app.get("/api/tenant/maintenance-chats/:chatId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      const { chatId } = req.params;
      const chat = await storage.getMaintenanceChatById(chatId);

      if (!chat || chat.tenantId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }

      const messages = await storage.getTenantMaintenanceChatMessages(chatId);
      res.json({ ...chat, messages });
    } catch (error) {
      console.error("Error fetching chat:", error);
      res.status(500).json({ message: "Failed to fetch chat" });
    }
  });

  // Send message in maintenance chat with AI response
  app.post("/api/tenant/maintenance-chat/message", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get tenant's tenancy to access propertyId
      const tenancy = await storage.getTenancyByTenantId(userId);
      if (!tenancy) {
        return res.status(404).json({ message: "No tenancy found for this tenant" });
      }

      const { chatId, message, imageUrl } = req.body;

      if (!message && !imageUrl) {
        return res.status(400).json({ message: "Message or image required" });
      }

      let chat;
      if (chatId) {
        chat = await storage.getMaintenanceChatById(chatId);
        if (!chat || chat.tenantId !== userId) {
          return res.status(404).json({ message: "Chat not found" });
        }
      } else {
        const title = message.substring(0, 50) + (message.length > 50 ? "..." : "");
        chat = await storage.createTenantMaintenanceChat({
          tenantId: userId,
          organizationId: user.organizationId!,
          propertyId: tenancy.propertyId,
          title,
          status: "active",
        });
      }

      const userMessage = await storage.createTenantMaintenanceChatMessage({
        chatId: chat.id,
        role: "user",
        content: message || "See image",
        imageUrl,
      });

      let aiResponse = "";
      let aiSuggestedFixes = "";

      try {
        const openaiClient = getOpenAI();
        
        if (imageUrl) {
          const analysisCompletion = await openaiClient.chat.completions.create({
            model: "gpt-5",
            messages: [
              {
                role: "system",
                content: "You are a helpful AI maintenance assistant. Analyze the issue described and/or shown in the image, then provide practical troubleshooting steps and potential fixes that a tenant could try themselves. Be specific and helpful."
              },
              {
                role: "user",
                content: [
                  { type: "text", text: message || "Please analyze this maintenance issue" },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            max_completion_tokens: 500,
          });

          aiResponse = analysisCompletion.choices[0]?.message?.content || "I analyzed the image but couldn't generate suggestions.";
          aiSuggestedFixes = aiResponse;
        } else {
          const completion = await openaiClient.chat.completions.create({
            model: "gpt-5",
            messages: [
              {
                role: "system",
                content: "You are a helpful AI maintenance assistant. Provide practical troubleshooting steps and potential fixes based on the issue described. Be specific and helpful."
              },
              { role: "user", content: message },
            ],
            max_completion_tokens: 500,
          });

          aiResponse = completion.choices[0]?.message?.content || "I couldn't generate suggestions for this issue.";
          aiSuggestedFixes = aiResponse;
        }
      } catch (error) {
        console.error("AI analysis error:", error);
        aiResponse = "I'm having trouble analyzing this right now. You may want to create a maintenance request directly.";
      }

      const assistantMessage = await storage.createTenantMaintenanceChatMessage({
        chatId: chat.id,
        role: "assistant",
        content: aiResponse,
        aiSuggestedFixes,
      });

      res.json({ chatId: chat.id, userMessage, assistantMessage });
    } catch (error) {
      console.error("Error sending maintenance chat message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Create maintenance request from chat
  app.post("/api/tenant/maintenance-chat/create-request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant" || !user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { chatId } = req.body;
      const chat = await storage.getMaintenanceChatById(chatId);

      if (!chat || chat.tenantId !== userId) {
        return res.status(404).json({ message: "Chat not found" });
      }

      if (chat.maintenanceRequestId) {
        return res.status(400).json({ message: "Maintenance request already created for this chat" });
      }

      const messages = await storage.getTenantMaintenanceChatMessages(chatId);
      const tenancy = await storage.getTenancyByTenantId(userId);

      if (!tenancy) {
        return res.status(400).json({ message: "No tenancy found" });
      }

      let description = "";
      let photoUrls: string[] = [];
      let aiSuggestedFixes = "";

      for (const msg of messages) {
        if (msg.role === "user") {
          description += msg.content + "\n\n";
          if (msg.imageUrl) {
            photoUrls.push(msg.imageUrl);
          }
        } else if (msg.role === "assistant" && msg.aiSuggestedFixes) {
          aiSuggestedFixes = msg.aiSuggestedFixes;
        }
      }

      const maintenanceRequest = await storage.createMaintenanceRequest({
        title: chat.title,
        description: description.trim(),
        priority: "medium",
        status: "open",
        propertyId: tenancy.propertyId,
        reportedBy: userId,
        organizationId: user.organizationId,
        photoUrls,
        aiSuggestedFixes,
      });

      await storage.updateTenantMaintenanceChat(chatId, {
        maintenanceRequestId: maintenanceRequest.id,
        status: "resolved",
      });

      res.json(maintenanceRequest);
    } catch (error) {
      console.error("Error creating maintenance request from chat:", error);
      res.status(500).json({ message: "Failed to create maintenance request" });
    }
  });

  // Get tenant's maintenance requests
  app.get("/api/tenant/maintenance-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      const requests = await storage.getMaintenanceRequestsByReporter(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching tenant maintenance requests:", error);
      res.status(500).json({ message: "Failed to fetch requests" });
    }
  });

  // ==================== TENANT COMPARISON REPORTS ====================

  // Get tenant's comparison reports
  app.get("/api/tenant/comparison-reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      const reports = await storage.getComparisonReportsByTenant(userId);
      
      // Enrich with property info
      const enrichedReports = await Promise.all(
        reports.map(async (report) => {
          const property = await storage.getProperty(report.propertyId);
          return {
            ...report,
            property: property ? { id: property.id, name: property.name, address: property.address } : null,
          };
        })
      );

      res.json(enrichedReports);
    } catch (error) {
      console.error("Error fetching tenant comparison reports:", error);
      res.status(500).json({ message: "Failed to fetch comparison reports" });
    }
  });

  // Get single comparison report for tenant (with items and non-internal comments)
  app.get("/api/tenant/comparison-reports/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report) {
        return res.status(404).json({ message: "Comparison report not found" });
      }

      // Verify tenant has access to this report
      if (report.tenantId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get report items
      const items = await storage.getComparisonReportItems(id);

      // Get property info
      const property = await storage.getProperty(report.propertyId);

      res.json({ 
        ...report, 
        items,
        property: property ? { id: property.id, name: property.name, address: property.address } : null,
      });
    } catch (error) {
      console.error("Error fetching tenant comparison report:", error);
      res.status(500).json({ message: "Failed to fetch comparison report" });
    }
  });

  // Get comments for a comparison report (tenant view - excludes internal comments)
  app.get("/api/tenant/comparison-reports/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report || report.tenantId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const allComments = await storage.getComparisonComments(id);
      // Filter out internal comments - tenants shouldn't see internal notes
      const publicComments = allComments.filter(c => !c.isInternal);

      res.json(publicComments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Add comment to comparison report (tenant)
  app.post("/api/tenant/comparison-reports/:id/comments", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate content is a non-empty string
      if (typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ message: "Comment content is required" });
      }

      const trimmedContent = content.trim();

      const report = await storage.getComparisonReport(id);
      if (!report || report.tenantId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Prevent comments on finalized reports or when already signed
      if (report.status === "signed" || report.status === "filed" || report.tenantSignature) {
        return res.status(409).json({ message: "Cannot add comments to finalized reports" });
      }

      const authorName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

      const comment = await storage.createComparisonComment({
        comparisonReportId: id,
        userId: user.id,
        authorName,
        authorRole: "tenant",
        content: trimmedContent,
        isInternal: false, // Tenant comments are always public
      });

      res.json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // Sign comparison report (tenant)
  app.post("/api/tenant/comparison-reports/:id/sign", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { signature } = req.body;
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== "tenant") {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!signature || signature.trim().length === 0) {
        return res.status(400).json({ message: "Signature (typed name) is required" });
      }

      const report = await storage.getComparisonReport(id);
      if (!report || report.tenantId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Check report is in a signable state
      if (report.status !== "awaiting_signatures" && report.status !== "under_review") {
        return res.status(400).json({ message: "Report is not ready for signature" });
      }

      if (report.tenantSignature) {
        return res.status(400).json({ message: "You have already signed this report" });
      }

      const ipAddress = req.ip || req.connection?.remoteAddress || "unknown";
      const now = new Date();

      const updates: any = {
        tenantSignature: signature.trim(),
        tenantSignedAt: now,
        tenantIpAddress: ipAddress,
      };

      // Check if both parties have now signed
      if (report.operatorSignature) {
        updates.status = "signed";
      } else {
        updates.status = "awaiting_signatures";
      }

      const updatedReport = await storage.updateComparisonReport(id, updates);
      res.json(updatedReport);
    } catch (error) {
      console.error("Error signing comparison report:", error);
      res.status(500).json({ message: "Failed to sign comparison report" });
    }
  });

  // ==================== REPORTS ====================

  // Branding info type for reports
  interface ReportBrandingInfo {
    logoUrl?: string | null;
    brandingName?: string | null;
    brandingEmail?: string | null;
    brandingPhone?: string | null;
    brandingWebsite?: string | null;
  }

  // Sanitize URL for use in HTML attributes
  function sanitizeReportUrl(url: string): string {
    if (typeof url !== 'string' || !url.trim()) return '';
    const trimmed = url.trim();
    const lower = trimmed.toLowerCase();
    const safeProtocols = ['https://', 'http://'];
    const isSafeProtocol = safeProtocols.some(protocol => lower.startsWith(protocol));
    if (!isSafeProtocol) return '';
    return trimmed.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#039;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Helper function to generate Inspections Report HTML
  function generateInspectionsReportHTML(
    inspections: any[],
    properties: any[],
    blocks: any[],
    users: any[],
    filters: any,
    branding?: ReportBrandingInfo
  ): string {
    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const formatDate = (date: string | null) => {
      if (!date) return "N/A";
      return format(new Date(date), "MMM d, yyyy");
    };

    const getStatusBadge = (status: string) => {
      const statusMap: Record<string, { bg: string; color: string }> = {
        scheduled: { bg: "#f3f4f6", color: "#374151" },
        in_progress: { bg: "#dbeafe", color: "#1e40af" },
        completed: { bg: "#dcfce7", color: "#166534" },
        cancelled: { bg: "#fee2e2", color: "#991b1b" },
      };
      const config = statusMap[status] || { bg: "#f3f4f6", color: "#374151" };
      return `<span style="background: ${config.bg}; color: ${config.color}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: capitalize;">${escapeHtml(status.replace(/_/g, " "))}</span>`;
    };

    const totalInspections = inspections.length;
    const completedCount = inspections.filter(i => i.status === "completed").length;
    const inProgressCount = inspections.filter(i => i.status === "in_progress").length;
    const scheduledCount = inspections.filter(i => i.status === "scheduled").length;

    const filterSummary = [];
    if (filters.status && filters.status !== "all") filterSummary.push(`Status: ${filters.status}`);
    if (filters.type && filters.type !== "all") filterSummary.push(`Type: ${filters.type}`);
    if (filters.dateFrom) filterSummary.push(`From: ${formatDate(filters.dateFrom)}`);
    if (filters.dateTo) filterSummary.push(`To: ${formatDate(filters.dateTo)}`);

    // Branding for cover page
    const companyName = branding?.brandingName || "Inspect360";
    const hasLogo = !!branding?.logoUrl;
    const logoHtml = hasLogo
      ? `<img src="${sanitizeReportUrl(branding.logoUrl!)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
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

    const tableRows = inspections.map((inspection) => {
      const property = properties.find(p => p.id === inspection.propertyId);
      const block = blocks.find(b => b.id === property?.blockId);
      const inspector = users.find(u => u.id === inspection.inspectorId);
      const inspectorName = inspector
        ? `${inspector.firstName || ""} ${inspector.lastName || ""}`.trim() || inspector.email
        : "Unassigned";

      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px;">${formatDate(inspection.scheduledDate || inspection.createdAt)}</td>
          <td style="padding: 10px 12px; font-weight: 500;">${escapeHtml(property?.name || "Unknown")}</td>
          <td style="padding: 10px 12px;">${escapeHtml(block?.name || "N/A")}</td>
          <td style="padding: 10px 12px; text-transform: capitalize;">${escapeHtml(inspection.type?.replace(/-/g, " ") || "N/A")}</td>
          <td style="padding: 10px 12px;">${escapeHtml(inspectorName)}</td>
          <td style="padding: 10px 12px;">${getStatusBadge(inspection.status)}</td>
        </tr>
      `;
    }).join("");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
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
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-container { margin-bottom: 32px; }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 24px;
      font-weight: 600;
      margin-top: 12px;
      opacity: 0.95;
    }
    .cover-divider {
      width: 100px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 28px 0;
      border-radius: 2px;
    }
    .cover-title { font-size: 38px; font-weight: 700; margin-bottom: 12px; }
    .cover-date { font-size: 16px; opacity: 0.9; margin-top: 16px; }
    .cover-filters { margin-top: 16px; font-size: 14px; opacity: 0.85; }
    .cover-contact {
      position: absolute;
      bottom: 32px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 1;
    }
    /* Content area - Landscape optimized */
    .content { padding: 28px 36px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #00D5CC;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .page-title { font-size: 26px; font-weight: 800; color: #00D5CC; }
    .page-date { font-size: 13px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #00D5CC; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; color: #00D5CC; }
    .section-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-top: 32px; margin-bottom: 14px; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${logoHtml}
        ${companyNameHtml}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">Inspections Report</div>
      <div class="cover-date">Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</div>
      ${filterSummary.length > 0 ? `<div class="cover-filters">Filters: ${escapeHtml(filterSummary.join(" | "))}</div>` : ""}
    </div>
    ${contactInfoHtml}
  </div>

  <div class="content">
    <div class="page-header">
      <div class="page-title">Inspections Summary</div>
      <div class="page-date">${format(new Date(), "MMMM d, yyyy")}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Inspections</div>
        <div class="stat-value">${totalInspections}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Completed</div>
        <div class="stat-value">${completedCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">In Progress</div>
        <div class="stat-value">${inProgressCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Scheduled</div>
        <div class="stat-value">${scheduledCount}</div>
      </div>
    </div>

    <h2 class="section-title">Inspection Records</h2>
    
    ${inspections.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Property</th>
            <th>Block</th>
            <th>Type</th>
            <th>Inspector</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    ` : `
      <div style="text-align: center; padding: 40px; color: #999;">
        No inspections found matching the selected filters
      </div>
    `}
  </div>
</body>
</html>
    `;
  }

  // Helper function to generate Blocks Report HTML
  function generateBlocksReportHTML(
    blocks: any[],
    properties: any[],
    tenantAssignments: any[],
    branding?: ReportBrandingInfo
  ): string {
    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Branding for cover page
    const companyName = branding?.brandingName || "Inspect360";
    const hasLogo = !!branding?.logoUrl;
    const logoHtml = hasLogo
      ? `<img src="${sanitizeReportUrl(branding.logoUrl!)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
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

    // Calculate block statistics
    const blocksWithStats = blocks.map(block => {
      const blockProperties = properties.filter(p => p.blockId === block.id);
      const totalUnits = blockProperties.length;
      
      const occupiedUnits = blockProperties.filter(property => {
        return tenantAssignments.some(
          assignment => 
            assignment.propertyId === property.id && 
            assignment.status === "active"
        );
      }).length;

      const occupancyRate = totalUnits > 0 
        ? Math.round((occupiedUnits / totalUnits) * 100) 
        : 0;

      return {
        ...block,
        totalUnits,
        occupiedUnits,
        vacantUnits: totalUnits - occupiedUnits,
        occupancyRate,
      };
    });

    const totalProperties = properties.length;
    const avgOccupancyRate = blocksWithStats.length > 0
      ? Math.round(
          blocksWithStats.reduce((sum, block) => sum + block.occupancyRate, 0) / 
          blocksWithStats.length
        )
      : 0;
    const totalActiveTenants = tenantAssignments.filter(a => a.status === "active").length;

    const getOccupancyColor = (rate: number) => {
      if (rate >= 90) return { bg: "#dcfce7", color: "#166534" };
      if (rate >= 70) return { bg: "#fef3c7", color: "#92400e" };
      return { bg: "#fee2e2", color: "#991b1b" };
    };

    const tableRows = blocksWithStats.map((block) => {
      const colors = getOccupancyColor(block.occupancyRate);
      return `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; font-weight: 500;">${escapeHtml(block.name)}</td>
          <td style="padding: 10px 12px;">
            <div>${escapeHtml(block.address || "N/A")}</div>
            ${block.postcode ? `<div style="color: #666; font-size: 12px;">${escapeHtml(block.postcode)}</div>` : ""}
          </td>
          <td style="padding: 10px 12px; text-align: center;">${block.totalUnits}</td>
          <td style="padding: 10px 12px; text-align: center;">${block.occupiedUnits}</td>
          <td style="padding: 10px 12px; text-align: center;">${block.vacantUnits}</td>
          <td style="padding: 10px 12px; text-align: center;">
            <span style="background: ${colors.bg}; color: ${colors.color}; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
              ${block.occupancyRate}%
            </span>
          </td>
        </tr>
      `;
    }).join("");

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
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
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-container { margin-bottom: 32px; }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 24px;
      font-weight: 600;
      margin-top: 12px;
      opacity: 0.95;
    }
    .cover-divider {
      width: 100px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 28px 0;
      border-radius: 2px;
    }
    .cover-title { font-size: 38px; font-weight: 700; margin-bottom: 12px; }
    .cover-date { font-size: 16px; opacity: 0.9; margin-top: 16px; }
    .cover-contact {
      position: absolute;
      bottom: 32px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 1;
    }
    /* Content area - Landscape optimized */
    .content { padding: 28px 36px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #3B7A8C;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .page-title { font-size: 26px; font-weight: 800; color: #3B7A8C; }
    .page-date { font-size: 13px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #3B7A8C; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; color: #3B7A8C; }
    .section-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-top: 32px; margin-bottom: 14px; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${logoHtml}
        ${companyNameHtml}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">Blocks Report</div>
      <div class="cover-date">Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="content">
    <div class="page-header">
      <div class="page-title">Blocks Overview</div>
      <div class="page-date">${format(new Date(), "MMMM d, yyyy")}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Blocks</div>
        <div class="stat-value">${blocksWithStats.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Properties</div>
        <div class="stat-value">${totalProperties}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Occupancy</div>
        <div class="stat-value">${avgOccupancyRate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Tenants</div>
        <div class="stat-value">${totalActiveTenants}</div>
      </div>
    </div>

    <h2 class="section-title">Block Details</h2>
    
    ${blocksWithStats.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Block Name</th>
            <th>Address</th>
            <th style="text-align: center;">Total Units</th>
            <th style="text-align: center;">Occupied</th>
            <th style="text-align: center;">Vacant</th>
            <th style="text-align: center;">Occupancy Rate</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    ` : `
      <div style="text-align: center; padding: 40px; color: #999;">
        No blocks found
      </div>
    `}
  </div>
</body>
</html>
    `;
  }

  // Generate Blocks Report PDF
  app.post("/api/reports/blocks/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const blocks = await storage.getBlocksByOrganization(user.organizationId);
      const properties = await storage.getPropertiesByOrganization(user.organizationId);
      const tenantAssignments = await storage.getTenantAssignmentsByOrganization(user.organizationId);

      // Fetch organization branding
      const organization = await storage.getOrganization(user.organizationId);
      const branding: ReportBrandingInfo = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingWebsite: organization.brandingWebsite,
      } : {};

      const html = generateBlocksReportHTML(blocks, properties, tenantAssignments, branding);

      let browser;
      try {
        browser = await launchPuppeteerBrowser();

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

        res.contentType("application/pdf");
        res.send(Buffer.from(pdf));
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    } catch (error) {
      console.error("Error generating blocks report PDF:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // Generate Inspections Report PDF
  app.post("/api/reports/inspections/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { status, type, propertyId, blockId, dateFrom, dateTo } = req.body;

      // Get all inspections for the organization
      let inspections = await storage.getInspectionsByOrganization(user.organizationId);

      // Apply filters
      if (status && status !== "all") {
        inspections = inspections.filter(i => i.status === status);
      }

      if (type && type !== "all") {
        inspections = inspections.filter(i => i.type === type);
      }

      if (propertyId && propertyId !== "all") {
        inspections = inspections.filter(i => i.propertyId === propertyId);
      }

      if (blockId && blockId !== "all") {
        const properties = await storage.getPropertiesByOrganization(user.organizationId);
        const blockProperties = properties.filter(p => p.blockId === blockId);
        const blockPropertyIds = blockProperties.map(p => p.id);
        inspections = inspections.filter(i => blockPropertyIds.includes(i.propertyId));
      }

      if (dateFrom) {
        inspections = inspections.filter(i => {
          const inspectionDate = new Date(i.scheduledDate || i.createdAt);
          return inspectionDate >= new Date(dateFrom);
        });
      }

      if (dateTo) {
        inspections = inspections.filter(i => {
          const inspectionDate = new Date(i.scheduledDate || i.createdAt);
          return inspectionDate <= new Date(dateTo);
        });
      }

      // Sort by date
      inspections.sort((a, b) => {
        const dateA = new Date(a.scheduledDate || a.createdAt);
        const dateB = new Date(b.scheduledDate || b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

      // Get related data for the PDF
      const properties = await storage.getPropertiesByOrganization(user.organizationId);
      const blocks = await storage.getBlocksByOrganization(user.organizationId);
      const users = await storage.getUsersByOrganization(user.organizationId);

      // Fetch organization branding
      const organization = await storage.getOrganization(user.organizationId);
      const branding: ReportBrandingInfo = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingWebsite: organization.brandingWebsite,
      } : {};

      // Generate HTML for PDF
      const html = generateInspectionsReportHTML(inspections, properties, blocks, users, req.body, branding);

      // Generate PDF using Puppeteer
      let browser;
      try {
        browser = await launchPuppeteerBrowser();

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

        res.contentType("application/pdf");
        res.send(Buffer.from(pdf));
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    } catch (error) {
      console.error("Error generating inspections report PDF:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // HTML generation function for Properties Report
  function generatePropertiesReportHTML(properties: any[], blocks: any[], inspections: any[], tenantAssignments: any[], maintenanceRequests: any[], branding?: ReportBrandingInfo) {
    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Branding for cover page
    const companyName = branding?.brandingName || "Inspect360";
    const hasLogo = !!branding?.logoUrl;
    const logoHtml = hasLogo
      ? `<img src="${sanitizeReportUrl(branding.logoUrl!)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
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

    const propertiesWithStats = properties.map(property => {
      const propertyInspections = inspections.filter(i => i.propertyId === property.id);
      const latestInspection = propertyInspections.sort((a, b) => 
        new Date(b.scheduledDate || b.createdAt).getTime() - 
        new Date(a.scheduledDate || a.createdAt).getTime()
      )[0];

      const tenantAssignment = tenantAssignments.find(
        t => t.propertyId === property.id && t.status === "active"
      );

      const propertyMaintenance = maintenanceRequests.filter(
        m => m.propertyId === property.id
      );
      const openMaintenance = propertyMaintenance.filter(
        m => m.status === "open" || m.status === "in_progress"
      ).length;

      const block = blocks.find(b => b.id === property.blockId);

      return {
        ...property,
        block,
        totalInspections: propertyInspections.length,
        lastInspection: latestInspection,
        isOccupied: !!tenantAssignment,
        tenant: tenantAssignment,
        openMaintenanceCount: openMaintenance,
        totalMaintenanceCount: propertyMaintenance.length,
      };
    });

    const totalProperties = propertiesWithStats.length;
    const occupiedProperties = propertiesWithStats.filter(p => p.isOccupied).length;
    const vacantProperties = propertiesWithStats.filter(p => !p.isOccupied).length;
    const totalOpenMaintenance = propertiesWithStats.reduce((sum, p) => sum + p.openMaintenanceCount, 0);

    const tableRows = propertiesWithStats.map(property => `
      <tr>
        <td style="padding: 10px 12px;">${escapeHtml(property.block?.name || "N/A")}</td>
        <td style="padding: 10px 12px;">${escapeHtml(property.name || "N/A")}</td>
        <td style="padding: 10px 12px;">${escapeHtml(property.address || "")}</td>
        <td style="padding: 10px 12px; text-align: center;">
          <span style="padding: 3px 10px; border-radius: 4px; background: ${property.isOccupied ? '#00D5CC' : '#e5e7eb'}; color: ${property.isOccupied ? 'white' : '#374151'}; font-size: 11px;">
            ${property.isOccupied ? 'Occupied' : 'Vacant'}
          </span>
        </td>
        <td style="padding: 10px 12px;">${property.tenant ? escapeHtml(`${property.tenant.tenantFirstName} ${property.tenant.tenantLastName}`) : '-'}</td>
        <td style="padding: 10px 12px; text-align: center;">${property.totalInspections}</td>
        <td style="padding: 10px 12px; text-align: center;">${property.openMaintenanceCount}</td>
        <td style="padding: 10px 12px;">${property.lastInspection ? new Date(property.lastInspection.scheduledDate || property.lastInspection.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
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
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-container { margin-bottom: 32px; }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 24px;
      font-weight: 600;
      margin-top: 12px;
      opacity: 0.95;
    }
    .cover-divider {
      width: 100px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 28px 0;
      border-radius: 2px;
    }
    .cover-title { font-size: 38px; font-weight: 700; margin-bottom: 12px; }
    .cover-date { font-size: 16px; opacity: 0.9; margin-top: 16px; }
    .cover-contact {
      position: absolute;
      bottom: 32px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 1;
    }
    /* Content area - Landscape optimized */
    .content { padding: 28px 36px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #00D5CC;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .page-title { font-size: 26px; font-weight: 800; color: #00D5CC; }
    .page-date { font-size: 13px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    td { border-bottom: 1px solid #e5e7eb; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #00D5CC; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; color: #00D5CC; }
    .section-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-top: 32px; margin-bottom: 14px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${logoHtml}
        ${companyNameHtml}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">Properties Report</div>
      <div class="cover-date">Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="content">
    <div class="page-header">
      <div class="page-title">Properties Summary</div>
      <div class="page-date">${format(new Date(), "MMMM d, yyyy")}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Properties</div>
        <div class="stat-value">${totalProperties}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Occupied</div>
        <div class="stat-value">${occupiedProperties}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Vacant</div>
        <div class="stat-value">${vacantProperties}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Open Maintenance</div>
        <div class="stat-value">${totalOpenMaintenance}</div>
      </div>
    </div>

    <h2 class="section-title">Property Records</h2>
    
    ${properties.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Block</th>
            <th>Unit</th>
            <th>Address</th>
            <th style="text-align: center;">Status</th>
            <th>Tenant</th>
            <th style="text-align: center;">Inspections</th>
            <th style="text-align: center;">Open Maint.</th>
            <th>Last Inspection</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    ` : `
      <div style="text-align: center; padding: 40px; color: #999;">
        No properties found
      </div>
    `}

    <div class="footer">
      <p>Report generated by ${escapeHtml(companyName)}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Generate Properties Report PDF
  app.post("/api/reports/properties/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { blockId, status, searchTerm } = req.body;

      let properties = await storage.getPropertiesByOrganization(user.organizationId);
      const blocks = await storage.getBlocksByOrganization(user.organizationId);
      const inspections = await storage.getInspectionsByOrganization(user.organizationId);
      const tenantAssignments = await storage.getTenantAssignmentsByOrganization(user.organizationId);
      const maintenanceRequests = await storage.getMaintenanceByOrganization(user.organizationId);

      // Apply filters
      if (blockId && blockId !== "all") {
        properties = properties.filter(p => p.blockId === blockId);
      }

      if (status && status !== "all") {
        if (status === "occupied") {
          const occupiedPropertyIds = tenantAssignments
            .filter(t => t.status === "active")
            .map(t => t.propertyId);
          properties = properties.filter(p => occupiedPropertyIds.includes(p.id));
        } else if (status === "vacant") {
          const occupiedPropertyIds = tenantAssignments
            .filter(t => t.status === "active")
            .map(t => t.propertyId);
          properties = properties.filter(p => !occupiedPropertyIds.includes(p.id));
        }
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        properties = properties.filter(p => 
          p.address?.toLowerCase().includes(searchLower) ||
          p.name?.toLowerCase().includes(searchLower)
        );
      }

      // Fetch organization branding
      const organization = await storage.getOrganization(user.organizationId);
      const branding: ReportBrandingInfo = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingWebsite: organization.brandingWebsite,
      } : {};

      const html = generatePropertiesReportHTML(properties, blocks, inspections, tenantAssignments, maintenanceRequests, branding);

      let browser;
      try {
        browser = await launchPuppeteerBrowser();

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

        res.contentType("application/pdf");
        res.send(Buffer.from(pdf));
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    } catch (error) {
      console.error("Error generating properties report PDF:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // HTML generation function for Tenants Report
  function generateTenantsReportHTML(tenantAssignments: any[], properties: any[], blocks: any[], branding?: ReportBrandingInfo) {
    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Branding for cover page
    const companyName = branding?.brandingName || "Inspect360";
    const hasLogo = !!branding?.logoUrl;
    const logoHtml = hasLogo
      ? `<img src="${sanitizeReportUrl(branding.logoUrl!)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
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

    const enrichedTenants = tenantAssignments.map(tenant => {
      const property = properties.find(p => p.id === tenant.propertyId);
      const block = property ? blocks.find(b => b.id === property.blockId) : null;

      const leaseEndDate = tenant.leaseEndDate ? new Date(tenant.leaseEndDate) : null;
      const daysUntilExpiry = leaseEndDate ? Math.floor((leaseEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

      return {
        ...tenant,
        property,
        block,
        daysUntilExpiry,
        monthlyRent: tenant.monthlyRent ? parseFloat(tenant.monthlyRent) : 0,
      };
    });

    const totalTenants = enrichedTenants.length;
    const activeTenants = enrichedTenants.filter(t => t.status === "active").length;
    const expiringSoon = enrichedTenants.filter(t => t.daysUntilExpiry !== null && t.daysUntilExpiry >= 0 && t.daysUntilExpiry <= 60).length;
    const totalMonthlyRent = enrichedTenants
      .filter(t => t.status === "active")
      .reduce((sum, t) => sum + t.monthlyRent, 0);

    const tableRows = enrichedTenants.map(tenant => `
      <tr>
        <td style="padding: 10px 12px;">${escapeHtml(`${tenant.tenantFirstName} ${tenant.tenantLastName}`)}</td>
        <td style="padding: 10px 12px;">${escapeHtml(tenant.tenantEmail || 'N/A')}</td>
        <td style="padding: 10px 12px;">${escapeHtml(tenant.block?.name || 'N/A')}</td>
        <td style="padding: 10px 12px;">${escapeHtml(tenant.property?.unitNumber || 'N/A')}</td>
        <td style="padding: 10px 12px;">${tenant.leaseStartDate ? new Date(tenant.leaseStartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
        <td style="padding: 10px 12px;">${tenant.leaseEndDate ? new Date(tenant.leaseEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}${tenant.daysUntilExpiry !== null && tenant.daysUntilExpiry >= 0 ? ` (${tenant.daysUntilExpiry} days)` : ''}</td>
        <td style="padding: 10px 12px; text-align: right;">${tenant.monthlyRent > 0 ? '£' + tenant.monthlyRent.toLocaleString() : '-'}</td>
        <td style="padding: 10px 12px; text-align: center;">
          <span style="padding: 3px 10px; border-radius: 4px; background: ${tenant.status === 'active' ? '#00D5CC' : '#e5e7eb'}; color: ${tenant.status === 'active' ? 'white' : '#374151'}; font-size: 11px;">
            ${tenant.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
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
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-container { margin-bottom: 32px; }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 24px;
      font-weight: 600;
      margin-top: 12px;
      opacity: 0.95;
    }
    .cover-divider {
      width: 100px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 28px 0;
      border-radius: 2px;
    }
    .cover-title { font-size: 38px; font-weight: 700; margin-bottom: 12px; }
    .cover-date { font-size: 16px; opacity: 0.9; margin-top: 16px; }
    .cover-contact {
      position: absolute;
      bottom: 32px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 1;
    }
    /* Content area - Landscape optimized */
    .content { padding: 28px 36px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #00D5CC;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .page-title { font-size: 26px; font-weight: 800; color: #00D5CC; }
    .page-date { font-size: 13px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    td { border-bottom: 1px solid #e5e7eb; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #00D5CC; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; color: #00D5CC; }
    .section-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-top: 32px; margin-bottom: 14px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${logoHtml}
        ${companyNameHtml}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">Tenants Report</div>
      <div class="cover-date">Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="content">
    <div class="page-header">
      <div class="page-title">Tenants Summary</div>
      <div class="page-date">${format(new Date(), "MMMM d, yyyy")}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Tenants</div>
        <div class="stat-value">${totalTenants}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active</div>
        <div class="stat-value">${activeTenants}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Expiring Soon</div>
        <div class="stat-value">${expiringSoon}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Monthly Rent</div>
        <div class="stat-value">£${totalMonthlyRent.toLocaleString()}</div>
      </div>
    </div>

    <h2 class="section-title">Tenant Records</h2>
    
    ${tenantAssignments.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Tenant Name</th>
            <th>Email</th>
            <th>Block</th>
            <th>Property</th>
            <th>Lease Start</th>
            <th>Lease End</th>
            <th style="text-align: right;">Monthly Rent</th>
            <th style="text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    ` : `
      <div style="text-align: center; padding: 40px; color: #999;">
        No tenants found
      </div>
    `}

    <div class="footer">
      <p>Report generated by ${escapeHtml(companyName)}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Generate Tenants Report PDF
  app.post("/api/reports/tenants/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { blockId, propertyId, status, searchTerm } = req.body;

      let tenantAssignments = await storage.getTenantAssignmentsByOrganization(user.organizationId);
      const properties = await storage.getPropertiesByOrganization(user.organizationId);
      const blocks = await storage.getBlocksByOrganization(user.organizationId);

      // Apply filters
      if (blockId && blockId !== "all") {
        tenantAssignments = tenantAssignments.filter(t => {
          const property = properties.find(p => p.id === t.propertyId);
          return property?.blockId === blockId;
        });
      }

      if (propertyId && propertyId !== "all") {
        tenantAssignments = tenantAssignments.filter(t => t.propertyId === propertyId);
      }

      if (status && status !== "all") {
        if (status === "active") {
          tenantAssignments = tenantAssignments.filter(t => t.status === "active");
        } else if (status === "expiring") {
          tenantAssignments = tenantAssignments.filter(t => {
            const leaseEndDate = t.leaseEndDate ? new Date(t.leaseEndDate) : null;
            const daysUntilExpiry = leaseEndDate ? Math.floor((leaseEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            return daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 60;
          });
        } else if (status === "expired") {
          tenantAssignments = tenantAssignments.filter(t => {
            const leaseEndDate = t.leaseEndDate ? new Date(t.leaseEndDate) : null;
            const daysUntilExpiry = leaseEndDate ? Math.floor((leaseEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            return daysUntilExpiry !== null && daysUntilExpiry < 0;
          });
        }
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        tenantAssignments = tenantAssignments.filter(t => 
          t.tenantFirstName?.toLowerCase().includes(searchLower) ||
          t.tenantLastName?.toLowerCase().includes(searchLower) ||
          t.tenantEmail?.toLowerCase().includes(searchLower)
        );
      }

      // Fetch organization branding
      const organization = await storage.getOrganization(user.organizationId);
      const branding: ReportBrandingInfo = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingWebsite: organization.brandingWebsite,
      } : {};

      const html = generateTenantsReportHTML(tenantAssignments, properties, blocks, branding);

      let browser;
      try {
        browser = await launchPuppeteerBrowser();

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

        res.contentType("application/pdf");
        res.send(Buffer.from(pdf));
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    } catch (error) {
      console.error("Error generating tenants report PDF:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // HTML generation function for Inventory Report
  function generateInventoryReportHTML(assetInventory: any[], properties: any[], blocks: any[], branding?: ReportBrandingInfo) {
    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Branding for cover page
    const companyName = branding?.brandingName || "Inspect360";
    const hasLogo = !!branding?.logoUrl;
    const logoHtml = hasLogo
      ? `<img src="${sanitizeReportUrl(branding.logoUrl!)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
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

    const enrichedInventory = assetInventory.map(asset => {
      const property = properties.find(p => p.id === asset.propertyId);
      const block = property ? blocks.find(b => b.id === property.blockId) : 
                    blocks.find(b => b.id === asset.blockId);

      return {
        ...asset,
        property,
        block,
      };
    });

    const totalAssets = enrichedInventory.length;
    const blockAssets = enrichedInventory.filter(i => i.blockId && !i.propertyId).length;
    const propertyAssets = enrichedInventory.filter(i => i.propertyId).length;
    const damagedAssets = enrichedInventory.filter(i => 
      i.condition === "poor" || i.condition === "damaged"
    ).length;

    const tableRows = enrichedInventory.map(asset => `
      <tr>
        <td style="padding: 10px 12px;">${escapeHtml(asset.name || '')}</td>
        <td style="padding: 10px 12px;">
          <span style="padding: 3px 10px; border-radius: 4px; background: #f3f4f6; color: #374151; font-size: 11px;">
            ${escapeHtml(asset.category || 'Uncategorized')}
          </span>
        </td>
        <td style="padding: 10px 12px;">${escapeHtml(asset.location || 'N/A')}</td>
        <td style="padding: 10px 12px;">${asset.block ? escapeHtml(asset.block.name) : '-'}</td>
        <td style="padding: 10px 12px;">${asset.property ? escapeHtml(asset.property.name) : '-'}</td>
        <td style="padding: 10px 12px; text-align: center;">
          <span style="padding: 3px 10px; border-radius: 4px; background: ${
            asset.condition === 'excellent' || asset.condition === 'good' ? '#00D5CC' :
            asset.condition === 'fair' ? '#e5e7eb' : '#ef4444'
          }; color: ${
            asset.condition === 'excellent' || asset.condition === 'good' ? 'white' :
            asset.condition === 'fair' ? '#374151' : 'white'
          }; font-size: 11px;">
            ${escapeHtml(asset.condition || 'Unknown')}
          </span>
        </td>
        <td style="padding: 10px 12px; font-family: monospace; font-size: 11px;">${escapeHtml(asset.serialNumber || '-')}</td>
        <td style="padding: 10px 12px;">${asset.createdAt ? new Date(asset.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
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
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-container { margin-bottom: 32px; }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 24px;
      font-weight: 600;
      margin-top: 12px;
      opacity: 0.95;
    }
    .cover-divider {
      width: 100px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 28px 0;
      border-radius: 2px;
    }
    .cover-title { font-size: 38px; font-weight: 700; margin-bottom: 12px; }
    .cover-date { font-size: 16px; opacity: 0.9; margin-top: 16px; }
    .cover-contact {
      position: absolute;
      bottom: 32px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 1;
    }
    /* Content area - Landscape optimized */
    .content { padding: 28px 36px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #00D5CC;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .page-title { font-size: 26px; font-weight: 800; color: #00D5CC; }
    .page-date { font-size: 13px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    td { border-bottom: 1px solid #e5e7eb; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #00D5CC; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; color: #00D5CC; }
    .section-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-top: 32px; margin-bottom: 14px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${logoHtml}
        ${companyNameHtml}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">Inventory Report</div>
      <div class="cover-date">Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="content">
    <div class="page-header">
      <div class="page-title">Inventory Summary</div>
      <div class="page-date">${format(new Date(), "MMMM d, yyyy")}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Assets</div>
        <div class="stat-value">${totalAssets}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Block Assets</div>
        <div class="stat-value">${blockAssets}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Property Assets</div>
        <div class="stat-value">${propertyAssets}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Needs Attention</div>
        <div class="stat-value">${damagedAssets}</div>
      </div>
    </div>

    <h2 class="section-title">Asset Records</h2>
    
    ${assetInventory.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Asset Name</th>
            <th>Category</th>
            <th>Location</th>
            <th>Block</th>
            <th>Property</th>
            <th style="text-align: center;">Condition</th>
            <th>Serial Number</th>
            <th>Added</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    ` : `
      <div style="text-align: center; padding: 40px; color: #999;">
        No inventory items found
      </div>
    `}

    <div class="footer">
      <p>Report generated by ${escapeHtml(companyName)}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Generate Inventory Report PDF
  app.post("/api/reports/inventory/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { blockId, propertyId, category, condition, searchTerm } = req.body;

      let assetInventory = await storage.getAssetInventoryByOrganization(user.organizationId);
      const properties = await storage.getPropertiesByOrganization(user.organizationId);
      const blocks = await storage.getBlocksByOrganization(user.organizationId);

      // Apply filters
      if (blockId && blockId !== "all") {
        assetInventory = assetInventory.filter(i => 
          i.blockId === blockId || properties.find(p => p.id === i.propertyId)?.blockId === blockId
        );
      }

      if (propertyId && propertyId !== "all") {
        assetInventory = assetInventory.filter(i => i.propertyId === propertyId);
      }

      if (category && category !== "all") {
        assetInventory = assetInventory.filter(i => i.category === category);
      }

      if (condition && condition !== "all") {
        assetInventory = assetInventory.filter(i => i.condition === condition);
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        assetInventory = assetInventory.filter(i => 
          i.name?.toLowerCase().includes(searchLower) ||
          i.description?.toLowerCase().includes(searchLower) ||
          i.serialNumber?.toLowerCase().includes(searchLower) ||
          i.location?.toLowerCase().includes(searchLower)
        );
      }

      // Fetch organization branding
      const organization = await storage.getOrganization(user.organizationId);
      const branding: ReportBrandingInfo = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingWebsite: organization.brandingWebsite,
      } : {};

      const html = generateInventoryReportHTML(assetInventory, properties, blocks, branding);

      let browser;
      try {
        browser = await launchPuppeteerBrowser();

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

        res.contentType("application/pdf");
        res.send(Buffer.from(pdf));
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    } catch (error) {
      console.error("Error generating inventory report PDF:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // HTML generation function for Compliance Report
  function generateComplianceReportHTML(complianceDocuments: any[], properties: any[], blocks: any[], branding?: ReportBrandingInfo) {
    const escapeHtml = (str: string) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // Branding for cover page
    const companyName = branding?.brandingName || "Inspect360";
    const hasLogo = !!branding?.logoUrl;
    const logoHtml = hasLogo
      ? `<img src="${sanitizeReportUrl(branding.logoUrl!)}" alt="${escapeHtml(companyName)}" class="cover-logo-img" />`
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

    const enrichedDocuments = complianceDocuments.map(doc => {
      const property = properties.find(p => p.id === doc.propertyId);
      const block = property ? blocks.find(b => b.id === property.blockId) : 
                    blocks.find(b => b.id === doc.blockId);

      let status = "current";
      let daysUntilExpiry = null;

      if (doc.expiryDate) {
        const expiryDate = new Date(doc.expiryDate);
        daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry < 0) {
          status = "expired";
        } else if (daysUntilExpiry <= 30) {
          status = "expiring-soon";
        } else {
          status = "current";
        }
      }

      return {
        ...doc,
        property,
        block,
        status,
        daysUntilExpiry,
      };
    });

    const totalDocuments = enrichedDocuments.length;
    const currentDocuments = enrichedDocuments.filter(d => d.status === "current").length;
    const expiringSoon = enrichedDocuments.filter(d => d.status === "expiring-soon").length;
    const expired = enrichedDocuments.filter(d => d.status === "expired").length;

    const tableRows = enrichedDocuments.map(doc => `
      <tr>
        <td style="padding: 10px 12px;">${escapeHtml(doc.documentType)}</td>
        <td style="padding: 10px 12px;">
          <span style="padding: 3px 10px; border-radius: 4px; background: #f3f4f6; color: #374151; font-size: 11px;">
            ${doc.blockId && !doc.propertyId ? 'Block-Level' : 'Property-Level'}
          </span>
        </td>
        <td style="padding: 10px 12px;">${doc.block ? escapeHtml(doc.block.name) : '-'}</td>
        <td style="padding: 10px 12px;">${doc.property ? escapeHtml(doc.property.name) : '-'}</td>
        <td style="padding: 10px 12px;">
          ${doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No expiry'}
          ${doc.daysUntilExpiry !== null && doc.daysUntilExpiry >= 0 ? `<br><span style="font-size: 10px; color: #6b7280;">${doc.daysUntilExpiry} days left</span>` : ''}
          ${doc.daysUntilExpiry !== null && doc.daysUntilExpiry < 0 ? `<br><span style="font-size: 10px; color: #ef4444;">${Math.abs(doc.daysUntilExpiry)} days overdue</span>` : ''}
        </td>
        <td style="padding: 10px 12px; text-align: center;">
          <span style="padding: 3px 10px; border-radius: 4px; background: ${
            doc.status === 'expired' ? '#ef4444' :
            doc.status === 'expiring-soon' ? '#f59e0b' : '#00D5CC'
          }; color: white; font-size: 11px;">
            ${doc.status === 'expired' ? 'Expired' : doc.status === 'expiring-soon' ? 'Expiring Soon' : 'Current'}
          </span>
        </td>
        <td style="padding: 10px 12px;">${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
      </tr>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #333;
      background: white;
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
    .cover-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .cover-logo-container { margin-bottom: 32px; }
    .cover-logo-img {
      max-height: 100px;
      max-width: 280px;
      width: auto;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
    }
    .cover-logo-text {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      text-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .cover-company-name {
      font-size: 24px;
      font-weight: 600;
      margin-top: 12px;
      opacity: 0.95;
    }
    .cover-divider {
      width: 100px;
      height: 3px;
      background: rgba(255, 255, 255, 0.5);
      margin: 28px 0;
      border-radius: 2px;
    }
    .cover-title { font-size: 38px; font-weight: 700; margin-bottom: 12px; }
    .cover-date { font-size: 16px; opacity: 0.9; margin-top: 16px; }
    .cover-contact {
      position: absolute;
      bottom: 32px;
      font-size: 13px;
      opacity: 0.8;
      z-index: 1;
    }
    /* Content area - Landscape optimized */
    .content { padding: 28px 36px; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #00D5CC;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .page-title { font-size: 26px; font-weight: 800; color: #00D5CC; }
    .page-date { font-size: 13px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
    th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    td { border-bottom: 1px solid #e5e7eb; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
    .stat-card { background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #00D5CC; }
    .stat-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; color: #00D5CC; }
    .section-title { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-top: 32px; margin-bottom: 14px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; }
  </style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-content">
      <div class="cover-logo-container">
        ${logoHtml}
        ${companyNameHtml}
      </div>
      <div class="cover-divider"></div>
      <div class="cover-title">Compliance Report</div>
      <div class="cover-date">Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</div>
    </div>
    ${contactInfoHtml}
  </div>

  <div class="content">
    <div class="page-header">
      <div class="page-title">Compliance Summary</div>
      <div class="page-date">${format(new Date(), "MMMM d, yyyy")}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Documents</div>
        <div class="stat-value">${totalDocuments}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Current</div>
        <div class="stat-value">${currentDocuments}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Expiring Soon</div>
        <div class="stat-value">${expiringSoon}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Expired</div>
        <div class="stat-value">${expired}</div>
      </div>
    </div>

    <h2 class="section-title">Compliance Records</h2>
    
    ${complianceDocuments.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Document Type</th>
            <th>Location</th>
            <th>Block</th>
            <th>Property</th>
            <th>Expiry Date</th>
            <th style="text-align: center;">Status</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    ` : `
      <div style="text-align: center; padding: 40px; color: #999;">
        No compliance documents found
      </div>
    `}

    <div class="footer">
      <p>Report generated by ${escapeHtml(companyName)}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Generate Compliance Report PDF
  app.post("/api/reports/compliance/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !user.organizationId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { blockId, propertyId, documentType, status, searchTerm } = req.body;

      let complianceDocuments = await storage.getComplianceDocuments(user.organizationId);
      const properties = await storage.getPropertiesByOrganization(user.organizationId);
      const blocks = await storage.getBlocksByOrganization(user.organizationId);

      // Apply filters
      if (blockId && blockId !== "all") {
        complianceDocuments = complianceDocuments.filter(d => 
          d.blockId === blockId || properties.find(p => p.id === d.propertyId)?.blockId === blockId
        );
      }

      if (propertyId && propertyId !== "all") {
        complianceDocuments = complianceDocuments.filter(d => d.propertyId === propertyId);
      }

      if (documentType && documentType !== "all") {
        complianceDocuments = complianceDocuments.filter(d => d.documentType === documentType);
      }

      if (status && status !== "all") {
        complianceDocuments = complianceDocuments.filter(d => {
          let docStatus = "current";
          if (d.expiryDate) {
            const expiryDate = new Date(d.expiryDate);
            const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            
            if (daysUntilExpiry < 0) {
              docStatus = "expired";
            } else if (daysUntilExpiry <= 30) {
              docStatus = "expiring-soon";
            } else {
              docStatus = "current";
            }
          }
          return docStatus === status;
        });
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        complianceDocuments = complianceDocuments.filter(d => 
          d.documentType?.toLowerCase().includes(searchLower)
        );
      }

      // Fetch organization branding
      const organization = await storage.getOrganization(user.organizationId);
      const branding: ReportBrandingInfo = organization ? {
        logoUrl: organization.logoUrl,
        brandingName: organization.brandingName,
        brandingEmail: organization.brandingEmail,
        brandingPhone: organization.brandingPhone,
        brandingWebsite: organization.brandingWebsite,
      } : {};

      const html = generateComplianceReportHTML(complianceDocuments, properties, blocks, branding);

      let browser;
      try {
        browser = await launchPuppeteerBrowser();

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

        res.contentType("application/pdf");
        res.send(Buffer.from(pdf));
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    } catch (error) {
      console.error("Error generating compliance report PDF:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // ==================== FEEDBACK SYSTEM ROUTES ====================

  // User: Submit feedback
  app.post("/api/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { title, description, priority, category } = req.body;
      
      if (!title || !description) {
        return res.status(400).json({ message: "Title and description are required" });
      }

      let organizationName = null;
      if (user.organizationId) {
        const org = await storage.getOrganization(user.organizationId);
        organizationName = org?.name;
      }

      const feedback = await storage.createFeedback({
        title,
        description,
        priority: priority || "medium",
        category: category || "feature",
        userId: user.id,
        userEmail: user.email,
        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
        organizationId: user.organizationId || null,
        organizationName,
      });

      // Send notification emails to central team
      try {
        const teamConfig = await storage.getCentralTeamConfig();
        const activeEmails = teamConfig.filter(c => c.isActive).map(c => c.notificationEmail);
        
        if (activeEmails.length > 0) {
          const { sendEmail } = await import("./resend");
          const priorityLabel = priority === "high" ? "HIGH" : priority === "medium" ? "Medium" : "Low";
          const categoryLabel = category === "bug" ? "Bug Report" : category === "improvement" ? "Improvement" : "Feature Request";
          
          for (const email of activeEmails) {
            await sendEmail({
              to: email,
              subject: `[${priorityLabel}] New ${categoryLabel}: ${title}`,
              html: `
                <h2>New Feedback Submission</h2>
                <p><strong>Title:</strong> ${title}</p>
                <p><strong>Category:</strong> ${categoryLabel}</p>
                <p><strong>Priority:</strong> ${priorityLabel}</p>
                <p><strong>From:</strong> ${feedback.userName} (${feedback.userEmail})</p>
                <p><strong>Organization:</strong> ${organizationName || 'N/A'}</p>
                <hr />
                <p><strong>Description:</strong></p>
                <p>${description}</p>
                <hr />
                <p><small>View all feedback in the Eco-Admin panel.</small></p>
              `,
            });
          }
        }
      } catch (emailError) {
        console.error("Error sending feedback notification emails:", emailError);
      }

      res.json(feedback);
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // User: Get own feedback submissions
  app.get("/api/feedback/my", isAuthenticated, async (req: any, res) => {
    try {
      const feedback = await storage.getFeedbackByUser(req.user.id);
      res.json(feedback);
    } catch (error: any) {
      console.error("Error fetching user feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Admin: Get all feedback
  app.get("/api/admin/feedback", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { status, category, priority } = req.query;
      const filters: { status?: string; category?: string; priority?: string } = {};
      
      if (status && status !== "all") filters.status = status as string;
      if (category && category !== "all") filters.category = category as string;
      if (priority && priority !== "all") filters.priority = priority as string;

      const feedback = await storage.getAllFeedback(filters);
      res.json(feedback);
    } catch (error: any) {
      console.error("Error fetching all feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Admin: Get single feedback
  app.get("/api/admin/feedback/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const feedback = await storage.getFeedbackById(req.params.id);
      if (!feedback) {
        return res.status(404).json({ message: "Feedback not found" });
      }
      res.json(feedback);
    } catch (error: any) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Admin: Update feedback status/assignment
  app.patch("/api/admin/feedback/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { status, assignedTo, assignedDepartment, resolutionNotes } = req.body;
      const updates: any = {};
      
      if (status) updates.status = status;
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      if (assignedDepartment !== undefined) updates.assignedDepartment = assignedDepartment;
      if (resolutionNotes !== undefined) updates.resolutionNotes = resolutionNotes;

      const feedback = await storage.updateFeedback(req.params.id, updates);
      res.json(feedback);
    } catch (error: any) {
      console.error("Error updating feedback:", error);
      res.status(500).json({ message: "Failed to update feedback" });
    }
  });

  // Admin: Get central team config
  app.get("/api/admin/feedback-team", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const team = await storage.getCentralTeamConfig();
      res.json(team);
    } catch (error: any) {
      console.error("Error fetching feedback team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  // Admin: Add central team email
  app.post("/api/admin/feedback-team", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const config = await storage.addCentralTeamEmail(email);
      res.json(config);
    } catch (error: any) {
      console.error("Error adding team email:", error);
      res.status(500).json({ message: "Failed to add team email" });
    }
  });

  // Admin: Update central team email status
  app.patch("/api/admin/feedback-team/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { isActive } = req.body;
      const config = await storage.updateCentralTeamEmail(req.params.id, isActive);
      res.json(config);
    } catch (error: any) {
      console.error("Error updating team email:", error);
      res.status(500).json({ message: "Failed to update team email" });
    }
  });

  // Admin: Remove central team email
  app.delete("/api/admin/feedback-team/:id", isAuthenticated, async (req: any, res) => {
    try {
      const adminUser = await storage.getAdminByEmail(req.user.email);
      if (!adminUser) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.removeCentralTeamEmail(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error removing team email:", error);
      res.status(500).json({ message: "Failed to remove team email" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
