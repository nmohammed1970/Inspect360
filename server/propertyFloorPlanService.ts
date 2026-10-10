/**
 * Property floor-plan AI analysis.
 * On success, writes validated room counts onto the property (user can still edit afterward).
 */
import { eq } from "drizzle-orm";
import { readFile, writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { randomUUID } from "crypto";
import OpenAI from "openai";
import puppeteer from "puppeteer";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { db } from "./db";
import { properties, type Property } from "@shared/schema";
import { ObjectStorageService } from "./objectStorage";
import { toOpenAIImageDataUrl } from "./imageForAi";
import { getChatModel } from "./aiModels";
import { extractTextFromFile } from "./documentProcessor";
import {
  FLOOR_PLAN_MAX_BYTES,
  isAllowedFloorPlanMime,
  normalizeAiLayoutResult,
  type AiLayoutSuggestion,
  type FloorPlanAnalysisStatus,
} from "@shared/propertyLayout";

const FLOOR_PLAN_SYSTEM_PROMPT = `You analyse residential property floor-plan images (and OCR/text from floor-plan PDFs).
Return ONLY a JSON object with this shape:
{
  "bedrooms": <integer 1-30>,
  "kitchens": <integer 1-30>,
  "bathrooms": <integer 1-30>,
  "livingRooms": <integer 1-30>,
  "confidence": {
    "bedrooms": "high"|"medium"|"low",
    "kitchens": "high"|"medium"|"low",
    "bathrooms": "high"|"medium"|"low",
    "livingRooms": "high"|"medium"|"low"
  },
  "estimatedMeasurements": [
    {
      "roomLabel": "Bedroom 1",
      "roomType": "bedrooms"|"kitchens"|"bathrooms"|"livingRooms"|"other",
      "lengthM": <number or null>,
      "widthM": <number or null>,
      "areaM2": <number or null>
    }
  ],
  "notes": "<optional short caveat>"
}
Count bathrooms including ensuites and WCs when clearly rooms.
Living rooms include lounges/reception rooms (not bedrooms).
Measurements are estimates only when dimensions/scale are visible; otherwise null.
If unsure, use best estimate with low confidence. Never invent dozens of rooms.`;

function getOpenAI(): OpenAI {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw Object.assign(new Error("AI is not configured"), { status: 503 });
  }
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

/** Map OpenAI / provider errors to safe client-facing messages. */
function mapAiProviderError(e: any): Error {
  const status = e?.status || e?.statusCode;
  const code = e?.code || e?.error?.code;
  const type = e?.type || e?.error?.type;
  const raw = String(e?.message || e?.error?.message || "");

  if (
    status === 429 ||
    code === "insufficient_quota" ||
    code === "credit_balance_exhausted" ||
    type === "insufficient_quota" ||
    /no credits remaining|credit_balance_exhausted|insufficient_quota/i.test(raw)
  ) {
    return httpError(
      "AI credits are exhausted on the OpenAI account. Add billing credits, then try analysing the floor plan again. You can still enter room counts manually.",
      429,
    );
  }
  if (status === 503 || raw.includes("AI is not configured")) {
    return httpError("AI is not configured", 503);
  }
  if (status && status >= 400 && status < 600) {
    return httpError(
      raw.includes("Could not read")
        ? raw
        : "We couldn't analyse the floor plan automatically. Enter room counts manually.",
      status === 422 ? 422 : 502,
    );
  }
  return httpError(
    "We couldn't analyse the floor plan automatically. Enter room counts manually.",
    502,
  );
}

function normalizeObjectPath(raw: string): string {
  if (raw.startsWith("/objects/")) return raw.split("?")[0];
  if (raw.includes("/objects/")) {
    return `/objects/${raw.split("/objects/")[1]?.split("?")[0]}`;
  }
  throw httpError("Invalid floor plan URL", 400);
}

async function loadObjectBuffer(objectPath: string): Promise<Buffer> {
  const file = await new ObjectStorageService().getObjectEntityFile(objectPath);
  return readFile(file.name);
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function launchBrowser() {
  const isReplit = process.env.REPL_ID || process.env.REPLIT;
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.NETLIFY;
  const isDocker =
    process.env.RUNNING_IN_DOCKER === "true" || process.env.USE_SPARTICUZ_CHROMIUM === "true";
  const useChromium = !!(isReplit || isServerless || isDocker);

  if (useChromium) {
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

/** Rasterize up to maxPages of a PDF to JPEG data URLs for vision. */
async function rasterizePdfPages(pdfBuffer: Buffer, maxPages = 3): Promise<string[]> {
  const tmpPath = join(tmpdir(), `floorplan-${randomUUID()}.pdf`);
  await writeFile(tmpPath, pdfBuffer);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmpPath).href, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    const urls: string[] = [];
    for (let i = 0; i < maxPages; i++) {
      const shot = (await page.screenshot({ type: "jpeg", quality: 82 })) as Buffer;
      urls.push(`data:image/jpeg;base64,${shot.toString("base64")}`);
      await page.keyboard.press("PageDown");
      await new Promise((r) => setTimeout(r, 400));
    }
    return urls;
  } finally {
    await browser.close().catch(() => undefined);
    await unlink(tmpPath).catch(() => undefined);
  }
}

async function analyseWithVision(imageDataUrls: string[]): Promise<AiLayoutSuggestion> {
  const client = getOpenAI();
  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: "Analyse this floor plan and return room counts as JSON.",
    },
    ...imageDataUrls.slice(0, 3).map(
      (url): OpenAI.Chat.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url, detail: "high" },
      }),
    ),
  ];
  const response = await client.chat.completions.create({
    model: getChatModel(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: FLOOR_PLAN_SYSTEM_PROMPT },
      { role: "user", content },
    ],
  });
  const parsed = extractJsonObject(response.choices[0]?.message?.content || "{}");
  const normalized = normalizeAiLayoutResult(parsed);
  if (!normalized) throw httpError("AI returned invalid layout JSON", 502);
  return normalized;
}

async function analyseWithText(text: string): Promise<AiLayoutSuggestion> {
  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: getChatModel(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: FLOOR_PLAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Floor plan text/OCR excerpt:\n\n${text.slice(0, 12000)}\n\nReturn room counts as JSON.`,
      },
    ],
  });
  const parsed = extractJsonObject(response.choices[0]?.message?.content || "{}");
  const normalized = normalizeAiLayoutResult(parsed);
  if (!normalized) throw httpError("AI returned invalid layout JSON", 502);
  return normalized;
}

export async function assertPropertyAccess(
  propertyId: string,
  organizationId: string,
): Promise<Property> {
  const [property] = await db.select().from(properties).where(eq(properties.id, propertyId));
  if (!property || property.organizationId !== organizationId) {
    throw httpError("Property not found", 404);
  }
  return property;
}

export async function attachFloorPlan(input: {
  propertyId: string;
  organizationId: string;
  documentUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<Property> {
  await assertPropertyAccess(input.propertyId, input.organizationId);
  const path = normalizeObjectPath(input.documentUrl);
  const mime = (input.mimeType || "").toLowerCase().split(";")[0].trim();
  if (mime && !isAllowedFloorPlanMime(mime)) {
    throw httpError("Unsupported file type. Use JPG, PNG, WebP, HEIC, or PDF.", 400);
  }

  try {
    const buf = await loadObjectBuffer(path);
    if (buf.length > FLOOR_PLAN_MAX_BYTES) {
      throw httpError("Floor plan file is too large (max 25MB).", 400);
    }
  } catch (e: any) {
    if (e?.status) throw e;
    throw httpError("Floor plan file not found in storage", 400);
  }

  const [updated] = await db
    .update(properties)
    .set({
      floorPlanUrl: path,
      floorPlanMimeType: mime || null,
      floorPlanFileName: input.fileName || null,
      floorPlanUploadedAt: new Date(),
      floorPlanAnalysisStatus: "none",
      floorPlanAnalysisJson: null,
      floorPlanAnalysedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, input.propertyId))
    .returning();
  return updated;
}

export async function removeFloorPlan(input: {
  propertyId: string;
  organizationId: string;
}): Promise<Property> {
  await assertPropertyAccess(input.propertyId, input.organizationId);
  const [updated] = await db
    .update(properties)
    .set({
      floorPlanUrl: null,
      floorPlanMimeType: null,
      floorPlanFileName: null,
      floorPlanUploadedAt: null,
      floorPlanAnalysisStatus: "none",
      floorPlanAnalysisJson: null,
      floorPlanAnalysedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, input.propertyId))
    .returning();
  return updated;
}

/**
 * Analyse an uploaded object (no property required). Used on create-modal upload
 * so room counts fill immediately before the property exists.
 */
export async function analyseFloorPlanObject(input: {
  documentUrl: string;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<{
  suggestion: AiLayoutSuggestion;
  analysisJson: Record<string, unknown>;
}> {
  const path = normalizeObjectPath(input.documentUrl);
  const mime = (input.mimeType || "").toLowerCase().split(";")[0].trim();
  if (mime && !isAllowedFloorPlanMime(mime)) {
    throw httpError("Unsupported file type. Use JPG, PNG, WebP, HEIC, or PDF.", 400);
  }

  try {
    const buf = await loadObjectBuffer(path);
    if (buf.length > FLOOR_PLAN_MAX_BYTES) {
      throw httpError("Floor plan file is too large (max 25MB).", 400);
    }
  } catch (e: any) {
    if (e?.status) throw e;
    throw httpError("Floor plan file not found in storage", 400);
  }

  const fileName = (input.fileName || "").toLowerCase();
  const isPdf =
    mime.includes("pdf") || path.toLowerCase().endsWith(".pdf") || fileName.endsWith(".pdf");

  try {
    let suggestion: AiLayoutSuggestion;
    if (isPdf) {
      const buf = await loadObjectBuffer(path);
      let visionOk = false;
      try {
        const pages = await rasterizePdfPages(buf, 3);
        if (pages.length) {
          suggestion = await analyseWithVision(pages);
          visionOk = true;
        }
      } catch (e) {
        console.warn("[FloorPlan] PDF rasterize/vision failed, trying text:", e);
      }
      if (!visionOk) {
        const text = await extractTextFromFile(path);
        if (!text || text.trim().length < 20) {
          throw httpError(
            "Could not read this PDF floor plan. Try uploading an image (JPG/PNG) or enter room counts manually.",
            422,
          );
        }
        suggestion = await analyseWithText(text);
      }
    } else {
      const buf = await loadObjectBuffer(path);
      const dataUrl = await toOpenAIImageDataUrl(buf);
      suggestion = await analyseWithVision([dataUrl]);
    }

    return {
      suggestion,
      analysisJson: {
        suggestion,
        analysedAt: new Date().toISOString(),
        estimated: true,
        disclaimer: "AI estimated from floor plan — adjust counts if needed.",
      },
    };
  } catch (e: any) {
    if (
      e?.status === 400 ||
      e?.status === 422 ||
      e?.status === 503 ||
      (typeof e?.message === "string" && e.message.includes("AI credits are exhausted"))
    ) {
      throw e;
    }
    throw mapAiProviderError(e);
  }
}

export async function analyseFloorPlan(input: {
  propertyId: string;
  organizationId: string;
}): Promise<Property> {
  const property = await assertPropertyAccess(input.propertyId, input.organizationId);
  if (!property.floorPlanUrl) {
    throw httpError("Upload a floor plan before analysing", 400);
  }

  await db
    .update(properties)
    .set({
      floorPlanAnalysisStatus: "processing" as FloorPlanAnalysisStatus,
      updatedAt: new Date(),
    })
    .where(eq(properties.id, input.propertyId));

  try {
    const { suggestion, analysisJson } = await analyseFloorPlanObject({
      documentUrl: property.floorPlanUrl,
      mimeType: property.floorPlanMimeType,
      fileName: property.floorPlanFileName,
    });

    const [updated] = await db
      .update(properties)
      .set({
        bedrooms: suggestion.bedrooms,
        kitchens: suggestion.kitchens,
        bathrooms: suggestion.bathrooms,
        livingRooms: suggestion.livingRooms,
        floorPlanAnalysisStatus: "complete",
        floorPlanAnalysisJson: { ...analysisJson, appliedToProperty: true } as any,
        floorPlanAnalysedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(properties.id, input.propertyId))
      .returning();
    return updated;
  } catch (e: any) {
    const message =
      e?.status === 503
        ? "AI is not configured"
        : e?.message || "Could not analyse floor plan";
    const [updated] = await db
      .update(properties)
      .set({
        floorPlanAnalysisStatus: "failed",
        floorPlanAnalysisJson: {
          error: message.includes("AI is not configured")
            ? "AI is not configured"
            : "We couldn't analyse the floor plan automatically. You can enter the room counts manually.",
          detail: message.slice(0, 300),
        } as any,
        floorPlanAnalysedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(properties.id, input.propertyId))
      .returning();
    return updated;
  }
}
