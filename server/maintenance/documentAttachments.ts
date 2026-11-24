import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { ObjectStorageService } from "../objectStorage";
import {
  maintenanceDocumentAttachments,
  type MaintenanceDocumentAttachment,
} from "@shared/schema";

export const MAX_DOCUMENT_ATTACHMENTS = 10;

export function isValidObjectStorageKey(key: string): boolean {
  const normalized = key.trim();
  return normalized.startsWith("/objects/") && !normalized.includes("..");
}

export async function listAttachmentsForQuote(
  organizationId: string,
  quoteId: string,
): Promise<MaintenanceDocumentAttachment[]> {
  return db
    .select()
    .from(maintenanceDocumentAttachments)
    .where(
      and(
        eq(maintenanceDocumentAttachments.organizationId, organizationId),
        eq(maintenanceDocumentAttachments.quoteId, quoteId),
      ),
    )
    .orderBy(asc(maintenanceDocumentAttachments.createdAt));
}

export async function listAttachmentsForInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<MaintenanceDocumentAttachment[]> {
  return db
    .select()
    .from(maintenanceDocumentAttachments)
    .where(
      and(
        eq(maintenanceDocumentAttachments.organizationId, organizationId),
        eq(maintenanceDocumentAttachments.invoiceId, invoiceId),
      ),
    )
    .orderBy(asc(maintenanceDocumentAttachments.createdAt));
}

export async function createQuoteAttachment(input: {
  organizationId: string;
  quoteId: string;
  storageKey: string;
  fileName: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  uploadedByUserId: string;
}): Promise<MaintenanceDocumentAttachment> {
  const objectStorage = new ObjectStorageService();
  const storageKey = objectStorage.normalizeObjectEntityPath(input.storageKey);
  if (!isValidObjectStorageKey(storageKey)) {
    throw Object.assign(new Error("Invalid storage key"), { statusCode: 400 });
  }

  const existing = await listAttachmentsForQuote(input.organizationId, input.quoteId);
  if (existing.length >= MAX_DOCUMENT_ATTACHMENTS) {
    throw Object.assign(
      new Error(`Maximum ${MAX_DOCUMENT_ATTACHMENTS} attachments allowed`),
      { statusCode: 400 },
    );
  }

  try {
    await objectStorage.trySetObjectEntityAclPolicy(storageKey, {
      owner: input.uploadedByUserId,
      visibility: "private",
    } as any);
  } catch {
    /* best-effort private ACL */
  }

  const [row] = await db
    .insert(maintenanceDocumentAttachments)
    .values({
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      invoiceId: null,
      storageKey,
      fileName: input.fileName.trim() || "attachment",
      mimeType: input.mimeType || null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning();
  return row;
}

export async function createInvoiceAttachment(input: {
  organizationId: string;
  invoiceId: string;
  storageKey: string;
  fileName: string;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  uploadedByUserId: string;
}): Promise<MaintenanceDocumentAttachment> {
  const objectStorage = new ObjectStorageService();
  const storageKey = objectStorage.normalizeObjectEntityPath(input.storageKey);
  if (!isValidObjectStorageKey(storageKey)) {
    throw Object.assign(new Error("Invalid storage key"), { statusCode: 400 });
  }

  const existing = await listAttachmentsForInvoice(input.organizationId, input.invoiceId);
  if (existing.length >= MAX_DOCUMENT_ATTACHMENTS) {
    throw Object.assign(
      new Error(`Maximum ${MAX_DOCUMENT_ATTACHMENTS} attachments allowed`),
      { statusCode: 400 },
    );
  }

  try {
    await objectStorage.trySetObjectEntityAclPolicy(storageKey, {
      owner: input.uploadedByUserId,
      visibility: "private",
    } as any);
  } catch {
    /* best-effort private ACL */
  }

  const [row] = await db
    .insert(maintenanceDocumentAttachments)
    .values({
      organizationId: input.organizationId,
      quoteId: null,
      invoiceId: input.invoiceId,
      storageKey,
      fileName: input.fileName.trim() || "attachment",
      mimeType: input.mimeType || null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning();
  return row;
}

export async function getAttachmentById(
  organizationId: string,
  attachmentId: string,
): Promise<MaintenanceDocumentAttachment | undefined> {
  const [row] = await db
    .select()
    .from(maintenanceDocumentAttachments)
    .where(
      and(
        eq(maintenanceDocumentAttachments.id, attachmentId),
        eq(maintenanceDocumentAttachments.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row;
}

/** Delete attachment row; remove blob only when no other rows share storageKey. */
export async function deleteAttachmentRefcounted(
  organizationId: string,
  attachmentId: string,
): Promise<void> {
  const row = await getAttachmentById(organizationId, attachmentId);
  if (!row) {
    throw Object.assign(new Error("Attachment not found"), { statusCode: 404 });
  }

  await db
    .delete(maintenanceDocumentAttachments)
    .where(eq(maintenanceDocumentAttachments.id, row.id));

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(maintenanceDocumentAttachments)
    .where(eq(maintenanceDocumentAttachments.storageKey, row.storageKey));

  if (Number(count) === 0) {
    try {
      const objectStorage = new ObjectStorageService();
      await objectStorage.deleteObjectEntity(row.storageKey);
    } catch {
      /* best-effort blob cleanup */
    }
  }
}

/** Copy quote attachment rows onto a new invoice (same storage keys). */
export async function copyQuoteAttachmentsToInvoice(input: {
  organizationId: string;
  quoteId: string;
  invoiceId: string;
  actorUserId: string;
}): Promise<number> {
  const rows = await listAttachmentsForQuote(input.organizationId, input.quoteId);
  if (rows.length === 0) return 0;

  await db.insert(maintenanceDocumentAttachments).values(
    rows.map((row) => ({
      organizationId: input.organizationId,
      quoteId: null,
      invoiceId: input.invoiceId,
      storageKey: row.storageKey,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      uploadedByUserId: input.actorUserId,
    })),
  );
  return rows.length;
}
