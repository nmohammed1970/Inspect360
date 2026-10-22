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
import { toFloorPlanImageDataUrl } from "./imageForAi";
import { getFloorPlanModel } from "./aiModels";
import { extractTextFromFile } from "./documentProcessor";
import {
  FLOOR_PLAN_MAX_BYTES,
  isAllowedFloorPlanMime,
  normalizeAiLayoutResult,
  type AiLayoutSuggestion,
  type FloorPlanAnalysisStatus,
} from "@shared/propertyLayout";
import {
  normalizeAiRoomsResult,
  type AiProposedRoom,
} from "@shared/propertyRooms";

function isGpt5Family(model: string): boolean {
  return /^gpt-5/i.test(model.trim());
}

const FLOOR_PLAN_SYSTEM_PROMPT = `You are an expert residential floor-plan reader (estate-agent / surveyor grade).
Analyse the floor-plan image(s) or OCR text carefully. Return ONLY a JSON object:

{
  "bedrooms": <integer>,
  "kitchens": <integer>,
  "bathrooms": <integer>,
  "livingRooms": <integer>,
  "confidence": {
    "bedrooms": "high"|"medium"|"low",
    "kitchens": "high"|"medium"|"low",
    "bathrooms": "high"|"medium"|"low",
    "livingRooms": "high"|"medium"|"low"
  },
  "rooms": [
    {
      "name": "Master Bedroom",
      "category": "Master Bedroom",
      "widthImperial": "12'3\\"",
      "lengthImperial": "8'9\\"",
      "widthM": <number metres, 3 d.p.>,
      "lengthM": <number metres, 3 d.p.>,
      "areaM2": <number or null>,
      "confidence": "high"|"medium"|"low"
    }
  ],
  "notes": "<optional short caveat>"
}

ROOM LIST (critical):
- List EVERY distinct labelled room/area on the plan as its own "rooms" entry.
- Include: bedrooms, bathrooms, en-suites, WCs, kitchens, living/lounge/reception/dining,
  hallway, landing, utility, study, cupboard/storage, garage, conservatory, garden/terrace when shown.
- Do NOT merge separate rooms. "Bedroom 1" and "Bedroom 2" are two entries.
- Aggregate counts MUST match the rooms list (bedrooms count = number of bedroom-category rooms, etc.).
- Living rooms = lounges / reception / sitting rooms (not bedrooms). A dual-labelled
  "Lounge / Diner" (or Lounge/Dining) is ONE living room entry — do not also add a separate dining room
  unless a distinctly labelled separate dining room exists.
- Bathrooms include ensuites and separate WCs/cloakrooms when they are rooms.

LANDINGS / STAIRS (critical — common failure):
- A landing is the floor area at a staircase (the space you step onto from the stairs).
- UP / DN / DOWN arrows on different floors of the SAME staircase are the SAME stair — count
  ONE landing for that staircase, not one per floor and not one per arrow.
- Example: ground floor shows "UP" and first floor shows "DN" for one stair core → rooms list
  has a single entry: name "Landing", category "Hallway" (or "Landing").
- Only create multiple landings when there are clearly separate staircases (e.g. front stair
  and rear stair, or a second independent stair core).
- Do NOT invent rooms named only "UP", "DN", "DOWN", or "IN" — those are stair direction markers.
- A distinctly labelled entrance hall / corridor (with its own label/dimensions) may be listed
  separately from the stair landing.

OTHER DEDUPE RULES:
- Do not list the same physical room twice under different names.
- Garden / terrace / patio: one entry unless clearly separate outdoor spaces are labelled.
- Cupboards inside a room are not separate rooms unless labelled as a walk-in / storage room.

DIMENSIONS (critical — match ChatGPT-quality reading):
- ALWAYS return widthM and lengthM in METRES (never put feet into widthM/lengthM).
- Also copy the printed imperial strings into widthImperial / lengthImperial when shown (e.g. "12'3\\"", "8'9\\"").
- When BOTH imperial and metric are printed on the plan, convert FROM the imperial feet/inches only.
  Do NOT use the rounded metric reprint (it causes errors like 8'9\\" → 2.66 m → 8.73 ft).
  Exact conversion: metres = (feet + inches/12) × 0.3048, round to 3 d.p.
  Example: 12'3\\" × 8'9\\" → widthImperial "12'3\\"", lengthImperial "8'9\\"",
  widthM 3.734, lengthM 2.667 (NOT 3.75 / 2.66).
- When only metric is printed, use those metres.
- When only imperial is printed, convert as above.
- Prefer the larger side as lengthM when orientation is unclear.
- If a scale bar is visible and a room has no printed size, estimate from the scale (confidence "medium"/"low").
- Only leave widthM/lengthM null when there is truly no label AND no usable scale.
- Do not invent dozens of rooms or impossible sizes (typical residential rooms ≈ 1.2–8 m per side).`;

function enrichSuggestion(raw: unknown): {
  suggestion: AiLayoutSuggestion;
  proposedRooms: AiProposedRoom[];
} {
  const roomsNorm = normalizeAiRoomsResult(raw);
  const layout = normalizeAiLayoutResult(raw);
  if (!layout && !roomsNorm?.rooms?.length) {
    throw httpError("AI returned invalid layout JSON", 502);
  }

  const proposedRooms = roomsNorm?.rooms?.length
    ? roomsNorm.rooms
    : (layout?.estimatedMeasurements || []).map((m) => ({
        name: m.roomLabel,
        category:
          m.roomType === "bedrooms"
            ? "Bedroom"
            : m.roomType === "bathrooms"
              ? "Bathroom"
              : m.roomType === "kitchens"
                ? "Kitchen"
                : m.roomType === "livingRooms"
                  ? "Living Room"
                  : "Other",
        widthM: m.widthM ?? null,
        lengthM: m.lengthM ?? null,
        areaM2: m.areaM2 ?? null,
        confidence: undefined as undefined,
      }));

  // Prefer counts derived from the room list when present
  const counts = roomsNorm?.counts ?? {
    bedrooms: layout!.bedrooms,
    kitchens: layout!.kitchens,
    bathrooms: layout!.bathrooms,
    livingRooms: layout!.livingRooms,
  };
  const suggestion: AiLayoutSuggestion = {
    ...counts,
    confidence: layout?.confidence,
    estimatedMeasurements: layout?.estimatedMeasurements,
    notes: roomsNorm?.notes ?? layout?.notes,
  };
  return { suggestion, proposedRooms };
}

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
    // High DPI so printed room dimensions remain readable to vision
    await page.setViewport({ width: 1600, height: 2000, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(tmpPath).href, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    const urls: string[] = [];
    for (let i = 0; i < maxPages; i++) {
      const shot = (await page.screenshot({
        type: "jpeg",
        quality: 92,
        fullPage: i === 0,
      })) as Buffer;
      urls.push(await toFloorPlanImageDataUrl(shot));
      await page.keyboard.press("PageDown");
      await new Promise((r) => setTimeout(r, 400));
    }
    return urls;
  } finally {
    await browser.close().catch(() => undefined);
    await unlink(tmpPath).catch(() => undefined);
  }
}

async function createFloorPlanCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<unknown> {
  const client = getOpenAI();
  const model = getFloorPlanModel();
  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model,
    response_format: { type: "json_object" },
    messages,
  };
  // gpt-5* only allows default temperature (1); older models use 0 for stable JSON
  if (!isGpt5Family(model)) {
    params.temperature = 0;
  }
  const response = await client.chat.completions.create(params);
  const content = response.choices[0]?.message?.content || "{}";
  if (!content.trim() || content.trim() === "{}") {
    throw httpError(
      `Floor plan model returned empty JSON (model=${model}, finish=${response.choices[0]?.finish_reason || "unknown"})`,
      502,
    );
  }
  return extractJsonObject(content);
}

async function analyseWithVision(imageDataUrls: string[]): Promise<{
  suggestion: AiLayoutSuggestion;
  proposedRooms: AiProposedRoom[];
}> {
  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text:
        "Analyse this residential floor plan. Detect landings, bedrooms, kitchens, bathrooms, " +
        "lounges/living rooms, utility rooms, halls, and garden spaces, with dimensions for each. " +
        "One staircase (UP on one floor / DN on another) = ONE landing — never duplicate landings " +
        "for the same stair. List every room with widthM/lengthM in metres (convert any feet/inches). " +
        "Return complete JSON as specified.",
    },
    ...imageDataUrls.slice(0, 3).map(
      (url): OpenAI.Chat.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url, detail: "high" },
      }),
    ),
  ];
  const parsed = await createFloorPlanCompletion([
    { role: "system", content: FLOOR_PLAN_SYSTEM_PROMPT },
    { role: "user", content },
  ]);
  return enrichSuggestion(parsed);
}

async function analyseWithText(text: string): Promise<{
  suggestion: AiLayoutSuggestion;
  proposedRooms: AiProposedRoom[];
}> {
  const parsed = await createFloorPlanCompletion([
    { role: "system", content: FLOOR_PLAN_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Floor plan text/OCR excerpt:\n\n${text.slice(0, 16000)}\n\n` +
        `Detect landings, bedrooms, kitchens, bathrooms, lounges, utility, halls, and gardens. ` +
        `One staircase (UP/DN on different floors) = ONE landing. List every room with dimensions in metres as JSON.`,
    },
  ]);
  return enrichSuggestion(parsed);
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
  proposedRooms: AiProposedRoom[];
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
    let analysed: { suggestion: AiLayoutSuggestion; proposedRooms: AiProposedRoom[] } | null =
      null;
    if (isPdf) {
      const buf = await loadObjectBuffer(path);
      try {
        const pages = await rasterizePdfPages(buf, 3);
        if (pages.length) {
          analysed = await analyseWithVision(pages);
        }
      } catch (e) {
        console.warn("[FloorPlan] PDF rasterize/vision failed, trying text:", e);
      }
      if (!analysed) {
        const text = await extractTextFromFile(path);
        if (!text || text.trim().length < 20) {
          throw httpError(
            "Could not read this PDF floor plan. Try uploading an image (JPG/PNG) or enter room counts manually.",
            422,
          );
        }
        analysed = await analyseWithText(text);
      }
    } else {
      const buf = await loadObjectBuffer(path);
      const dataUrl = await toFloorPlanImageDataUrl(buf);
      analysed = await analyseWithVision([dataUrl]);
    }

    const { suggestion, proposedRooms } = analysed;
    return {
      suggestion,
      proposedRooms,
      analysisJson: {
        suggestion,
        proposedRooms,
        analysedAt: new Date().toISOString(),
        estimated: true,
        model: getFloorPlanModel(),
        disclaimer:
          "AI estimated rooms from floor plan — review and apply before saving. Adjust dimensions if needed.",
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
    const { suggestion, proposedRooms, analysisJson } = await analyseFloorPlanObject({
      documentUrl: property.floorPlanUrl,
      mimeType: property.floorPlanMimeType,
      fileName: property.floorPlanFileName,
    });

    // Persist analysis + legacy counts; room list applied only after user review in the UI
    const [updated] = await db
      .update(properties)
      .set({
        bedrooms: suggestion.bedrooms,
        kitchens: suggestion.kitchens,
        bathrooms: suggestion.bathrooms,
        livingRooms: suggestion.livingRooms,
        floorPlanAnalysisStatus: "complete",
        floorPlanAnalysisJson: {
          ...analysisJson,
          proposedRooms,
          appliedToProperty: false,
          countsApplied: true,
        } as any,
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
    console.error("[FloorPlan] analyse failed:", message, e?.status || "", e?.code || "");
    const [updated] = await db
      .update(properties)
      .set({
        floorPlanAnalysisStatus: "failed",
        floorPlanAnalysisJson: {
          error: message.includes("AI is not configured")
            ? "AI is not configured"
            : "We couldn't analyse the floor plan automatically. You can enter the room counts manually.",
          detail: message.slice(0, 500),
        } as any,
        floorPlanAnalysedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(properties.id, input.propertyId))
      .returning();
    return updated;
  }
}
