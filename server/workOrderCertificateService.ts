import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  workOrderCertificates,
  workOrders,
  maintenanceRequests,
  complianceDocuments,
  type WorkOrderCertificate,
} from "@shared/schema";
import { DEFAULT_COMPLIANCE_DOC_TYPES } from "@shared/complianceDocTypes";
import {
  CERTIFICATE_EXTRACTION_SYSTEM_PROMPT,
  decideExtractionStatus,
  isAllowedCertificateMime,
  matchCertificateType,
  parseCertificateExpiryDate,
  isExpiryDateInPast,
  validateExtractionPayload,
  type CertificateExtractionResult,
} from "@shared/workOrderCertificates";
import { extractTextFromFile } from "./documentProcessor";
import { ObjectStorageService } from "./objectStorage";
import { readFile } from "fs/promises";
import OpenAI from "openai";

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

async function resolveWorkOrderContext(workOrderId: string, organizationId: string) {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId));
  if (!wo || wo.organizationId !== organizationId) {
    throw httpError("Work order not found", 404);
  }
  const [mr] = await db
    .select()
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.id, wo.maintenanceRequestId));
  if (!mr || mr.organizationId !== organizationId) {
    throw httpError("Maintenance request not found for work order", 404);
  }
  return {
    workOrder: wo,
    maintenanceRequest: mr,
    propertyId: mr.propertyId || null,
    blockId: mr.blockId || null,
  };
}

async function assertCertificateAccess(
  certId: string,
  workOrderId: string,
  organizationId: string,
): Promise<WorkOrderCertificate> {
  const [row] = await db
    .select()
    .from(workOrderCertificates)
    .where(
      and(
        eq(workOrderCertificates.id, certId),
        eq(workOrderCertificates.workOrderId, workOrderId),
        eq(workOrderCertificates.organizationId, organizationId),
      ),
    );
  if (!row) throw httpError("Certificate not found", 404);
  return row;
}

export async function listWorkOrderCertificates(organizationId: string, workOrderId: string) {
  await resolveWorkOrderContext(workOrderId, organizationId);
  return db
    .select()
    .from(workOrderCertificates)
    .where(
      and(
        eq(workOrderCertificates.workOrderId, workOrderId),
        eq(workOrderCertificates.organizationId, organizationId),
      ),
    )
    .orderBy(desc(workOrderCertificates.createdAt));
}

export async function createWorkOrderCertificate(input: {
  organizationId: string;
  workOrderId: string;
  userId: string;
  documentUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<WorkOrderCertificate> {
  const ctx = await resolveWorkOrderContext(input.workOrderId, input.organizationId);
  if (!input.documentUrl || typeof input.documentUrl !== "string") {
    throw httpError("documentUrl is required", 400);
  }
  const path = input.documentUrl.startsWith("/objects/")
    ? input.documentUrl
    : input.documentUrl.includes("/objects/")
      ? `/objects/${input.documentUrl.split("/objects/")[1]?.split("?")[0]}`
      : null;
  if (!path) throw httpError("Invalid document URL", 400);

  if (input.mimeType && !isAllowedCertificateMime(input.mimeType)) {
    throw httpError("Unsupported file type. Use PDF, JPG, or PNG.", 400);
  }

  const [row] = await db
    .insert(workOrderCertificates)
    .values({
      organizationId: input.organizationId,
      workOrderId: input.workOrderId,
      propertyId: ctx.propertyId,
      documentUrl: path,
      fileName: input.fileName || null,
      mimeType: input.mimeType || null,
      extractionStatus: "uploaded",
      createdBy: input.userId,
    })
    .returning();
  return row;
}

async function fileToDataUrl(objectPath: string, mimeType: string): Promise<string> {
  const file = await new ObjectStorageService().getObjectEntityFile(objectPath);
  const buf = await readFile(file.name);
  return `data:${mimeType};base64,${buf.toString("base64")}`;
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

async function knownTypesForOrg(organizationId: string): Promise<string[]> {
  let names: string[] = [];
  try {
    const custom = await storage.getComplianceDocumentTypes(organizationId);
    names = (custom || []).map((t: any) => t.name).filter(Boolean);
  } catch {
    names = [];
  }
  return Array.from(new Set([...DEFAULT_COMPLIANCE_DOC_TYPES, ...names, "Other"]));
}

async function runAiExtraction(params: {
  documentUrl: string;
  mimeType: string | null;
  knownTypes: string[];
}): Promise<{ result: CertificateExtractionResult; raw: unknown }> {
  const client = getOpenAI();
  const mime = (params.mimeType || "").toLowerCase();
  const typeList = params.knownTypes.join(", ");

  if (mime.includes("pdf") || params.documentUrl.toLowerCase().endsWith(".pdf")) {
    const extracted = await extractTextFromFile(params.documentUrl, "application/pdf");
    if (extracted.error || !extracted.extractedText?.trim()) {
      return {
        result: { certificateType: null, expiryDate: null, confidence: 0 },
        raw: { error: extracted.error || "No text extracted from PDF" },
      };
    }
    const text = extracted.extractedText.slice(0, 12000);
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CERTIFICATE_EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Known certificate type labels (prefer these when matching): ${typeList}\n\nDocument text:\n${text}`,
        },
      ],
    });
    const content = response.choices[0]?.message?.content || "{}";
    const parsed = extractJsonObject(content);
    return { result: validateExtractionPayload(parsed), raw: parsed };
  }

  // Image path — vision
  const imageMime = mime.startsWith("image/") ? mime : "image/jpeg";
  const dataUrl = await fileToDataUrl(params.documentUrl, imageMime);
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CERTIFICATE_EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Known certificate type labels (prefer these when matching): ${typeList}\nExtract from this certificate image.`,
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
  });
  const content = response.choices[0]?.message?.content || "{}";
  const parsed = extractJsonObject(content);
  return { result: validateExtractionPayload(parsed), raw: parsed };
}

export async function analyseWorkOrderCertificate(input: {
  organizationId: string;
  workOrderId: string;
  certificateId: string;
}): Promise<WorkOrderCertificate> {
  const cert = await assertCertificateAccess(
    input.certificateId,
    input.workOrderId,
    input.organizationId,
  );
  if (cert.extractionStatus === "added_to_compliance") {
    return cert;
  }

  await db
    .update(workOrderCertificates)
    .set({
      extractionStatus: "analysing",
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(workOrderCertificates.id, cert.id));

  try {
    const knownTypes = await knownTypesForOrg(input.organizationId);
    const { result, raw } = await runAiExtraction({
      documentUrl: cert.documentUrl,
      mimeType: cert.mimeType,
      knownTypes,
    });
    const matchedType = matchCertificateType(result.certificateType, knownTypes);
    const normalized: CertificateExtractionResult = {
      ...result,
      certificateType: matchedType,
    };
    const status = decideExtractionStatus(normalized);

    const [updated] = await db
      .update(workOrderCertificates)
      .set({
        extractionStatus: status,
        certificateType: matchedType,
        expiryDate: normalized.expiryDate ? new Date(`${normalized.expiryDate}T12:00:00.000Z`) : null,
        extractionConfidence: normalized.confidence,
        extractionRaw: raw as any,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(workOrderCertificates.id, cert.id))
      .returning();
    return updated;
  } catch (e: any) {
    const message = e?.message || "Analysis failed";
    const [updated] = await db
      .update(workOrderCertificates)
      .set({
        extractionStatus: "failed",
        processingError: message.includes("AI is not configured")
          ? "AI is not configured"
          : "Could not analyse certificate. Enter details manually.",
        updatedAt: new Date(),
      })
      .where(eq(workOrderCertificates.id, cert.id))
      .returning();
    return updated;
  }
}

export async function confirmWorkOrderCertificate(input: {
  organizationId: string;
  workOrderId: string;
  certificateId: string;
  userId: string;
  certificateType: string;
  expiryDate: string;
}): Promise<WorkOrderCertificate> {
  const cert = await assertCertificateAccess(
    input.certificateId,
    input.workOrderId,
    input.organizationId,
  );
  if (cert.extractionStatus === "added_to_compliance" && cert.complianceDocumentId) {
    return cert;
  }

  const type = (input.certificateType || "").trim();
  if (!type) throw httpError("Certificate type is required", 400);
  const ymd = parseCertificateExpiryDate(input.expiryDate);
  if (!ymd) throw httpError("A valid expiry date is required", 400);
  if (isExpiryDateInPast(ymd)) {
    throw httpError("Expiry date cannot be in the past", 400);
  }

  const ctx = await resolveWorkOrderContext(input.workOrderId, input.organizationId);
  if (!ctx.propertyId && !ctx.blockId) {
    throw httpError(
      "This work order is not linked to a property or block. Attach the maintenance request to a property or block first.",
      400,
    );
  }

  const compliance = await storage.createComplianceDocument({
    organizationId: input.organizationId,
    propertyId: ctx.propertyId,
    blockId: ctx.propertyId ? null : ctx.blockId,
    documentType: type,
    documentUrl: cert.documentUrl,
    expiryDate: new Date(`${ymd}T12:00:00.000Z`),
    status: "current",
    uploadedBy: input.userId,
    sourceWorkOrderId: input.workOrderId,
  } as any);

  const [updated] = await db
    .update(workOrderCertificates)
    .set({
      certificateType: type,
      expiryDate: new Date(`${ymd}T12:00:00.000Z`),
      extractionStatus: "added_to_compliance",
      complianceDocumentId: compliance.id,
      confirmedBy: input.userId,
      confirmedAt: new Date(),
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(workOrderCertificates.id, cert.id))
    .returning();

  // Touch compliance table column even if Insert type lagged
  try {
    await db
      .update(complianceDocuments)
      .set({ sourceWorkOrderId: input.workOrderId, updatedAt: new Date() })
      .where(eq(complianceDocuments.id, compliance.id));
  } catch {
    /* column may not exist yet on older DBs */
  }

  return updated;
}

export async function updateWorkOrderFields(input: {
  organizationId: string;
  workOrderId: string;
  userId: string;
  userRole: string;
  teamId?: string | null;
  assignedToId?: string | null;
  status?: string;
  slaDue?: string | Date | null;
  costEstimate?: number | null;
}): Promise<typeof workOrders.$inferSelect> {
  const ctx = await resolveWorkOrderContext(input.workOrderId, input.organizationId);
  if (input.userRole === "contractor" && ctx.workOrder.contractorId !== input.userId) {
    throw httpError("Access denied", 403);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.teamId !== undefined) updates.teamId = input.teamId === "unassigned" ? null : input.teamId;
  if (input.assignedToId !== undefined) updates.assignedToId = input.assignedToId;
  if (input.slaDue !== undefined) {
    updates.slaDue = input.slaDue ? new Date(input.slaDue) : null;
  }
  if (input.costEstimate !== undefined) updates.costEstimate = input.costEstimate;
  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === "completed") updates.completedAt = new Date();
  }

  const [row] = await db
    .update(workOrders)
    .set(updates as any)
    .where(eq(workOrders.id, input.workOrderId))
    .returning();
  return row;
}
