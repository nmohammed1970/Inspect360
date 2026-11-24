import type { Express, Response, NextFunction } from "express";
import { z } from "zod";
import { isAuthenticated, requireCompanyModule } from "../auth";
import { storage } from "../storage";
import { ObjectStorageService } from "../objectStorage";
import {
  buildWorkOrderIdentity,
  canAccessWorkOrder,
} from "../workOrderAccess";
import { isQuoteEditable } from "@shared/maintenanceQuoteConstants";
import {
  createInvoiceAttachment,
  createQuoteAttachment,
  deleteAttachmentRefcounted,
  getAttachmentById,
  listAttachmentsForInvoice,
  listAttachmentsForQuote,
} from "./documentAttachments";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { maintenanceInvoices, maintenanceQuotes } from "@shared/schema";

function orgId(req: any): string {
  return req.user.organizationId as string;
}

function rejectTenant(req: any, res: Response, next: NextFunction) {
  if (req.user?.role === "tenant") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

const guards = [isAuthenticated, requireCompanyModule("maintenance"), rejectTenant] as const;

const createBodySchema = z.object({
  storageKey: z.string().min(1).max(1000),
  fileName: z.string().min(1).max(500),
  mimeType: z.string().max(200).optional().nullable(),
  fileSizeBytes: z.coerce.number().int().min(0).max(100_000_000).optional().nullable(),
});

async function assertWoAccess(user: any, workOrderId: string) {
  const workOrder = await storage.getWorkOrder(workOrderId);
  if (!workOrder || workOrder.organizationId !== user.organizationId) {
    return { error: 404 as const, message: "Work order not found" };
  }
  const orgContacts = await storage.getContactsByOrganization(user.organizationId);
  const identity = buildWorkOrderIdentity({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role || "",
    email: user.email,
    orgContacts,
  });
  if (!canAccessWorkOrder(identity, workOrder)) {
    return { error: 403 as const, message: "Forbidden" };
  }
  return { workOrder };
}

async function getQuote(organizationId: string, workOrderId: string, quoteId: string) {
  const [row] = await db
    .select()
    .from(maintenanceQuotes)
    .where(
      and(
        eq(maintenanceQuotes.id, quoteId),
        eq(maintenanceQuotes.workOrderId, workOrderId),
        eq(maintenanceQuotes.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row;
}

async function getInvoice(organizationId: string, workOrderId: string, invoiceId: string) {
  const [row] = await db
    .select()
    .from(maintenanceInvoices)
    .where(
      and(
        eq(maintenanceInvoices.id, invoiceId),
        eq(maintenanceInvoices.workOrderId, workOrderId),
        eq(maintenanceInvoices.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row;
}

async function streamAttachment(
  res: Response,
  organizationId: string,
  attachmentId: string,
) {
  const row = await getAttachmentById(organizationId, attachmentId);
  if (!row) {
    res.status(404).json({ message: "Attachment not found" });
    return;
  }
  const objectStorage = new ObjectStorageService();
  const objectFile = await objectStorage.getObjectEntityFile(row.storageKey);
  res.setHeader("Content-Type", row.mimeType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${row.fileName.replace(/"/g, "")}"`,
  );
  objectStorage.downloadObject(objectFile, res, 0);
}

export function registerMaintenanceDocumentAttachmentRoutes(app: Express) {
  app.get(
    "/api/work-orders/:workOrderId/quotes/:quoteId/attachments",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const quote = await getQuote(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        const rows = await listAttachmentsForQuote(organizationId, quote.id);
        res.json(rows);
      } catch (error) {
        console.error("[attachments] quote list failed:", error);
        res.status(500).json({ message: "Failed to list attachments" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/attachments",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const quote = await getQuote(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        if (!isQuoteEditable(quote.status)) {
          return res.status(409).json({ message: "Quote attachments are only editable in draft" });
        }
        const parsed = createBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid attachment", errors: parsed.error.flatten() });
        }
        const row = await createQuoteAttachment({
          organizationId,
          quoteId: quote.id,
          storageKey: parsed.data.storageKey,
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          fileSizeBytes: parsed.data.fileSizeBytes,
          uploadedByUserId: req.user.id,
        });
        res.status(201).json(row);
      } catch (error: any) {
        console.error("[attachments] quote create failed:", error);
        res.status(error?.statusCode || 500).json({
          message: error?.message || "Failed to add attachment",
        });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/quotes/:quoteId/attachments/:attachmentId/download",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const quote = await getQuote(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        const row = await getAttachmentById(organizationId, req.params.attachmentId);
        if (!row || row.quoteId !== quote.id) {
          return res.status(404).json({ message: "Attachment not found" });
        }
        await streamAttachment(res, organizationId, row.id);
      } catch (error) {
        console.error("[attachments] quote download failed:", error);
        if (!res.headersSent) {
          res.status(404).json({ message: "Attachment not found" });
        }
      }
    },
  );

  app.delete(
    "/api/work-orders/:workOrderId/quotes/:quoteId/attachments/:attachmentId",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const quote = await getQuote(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        if (!isQuoteEditable(quote.status)) {
          return res.status(409).json({ message: "Quote attachments are only editable in draft" });
        }
        const row = await getAttachmentById(organizationId, req.params.attachmentId);
        if (!row || row.quoteId !== quote.id) {
          return res.status(404).json({ message: "Attachment not found" });
        }
        await deleteAttachmentRefcounted(organizationId, row.id);
        res.status(204).send();
      } catch (error: any) {
        console.error("[attachments] quote delete failed:", error);
        res.status(error?.statusCode || 500).json({
          message: error?.message || "Failed to delete attachment",
        });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/attachments",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const invoice = await getInvoice(
          organizationId,
          req.params.workOrderId,
          req.params.invoiceId,
        );
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        const rows = await listAttachmentsForInvoice(organizationId, invoice.id);
        res.json(rows);
      } catch (error) {
        console.error("[attachments] invoice list failed:", error);
        res.status(500).json({ message: "Failed to list attachments" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/attachments",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const invoice = await getInvoice(
          organizationId,
          req.params.workOrderId,
          req.params.invoiceId,
        );
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status !== "draft") {
          return res
            .status(409)
            .json({ message: "Invoice attachments are only editable in draft" });
        }
        const parsed = createBodySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid attachment", errors: parsed.error.flatten() });
        }
        const row = await createInvoiceAttachment({
          organizationId,
          invoiceId: invoice.id,
          storageKey: parsed.data.storageKey,
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          fileSizeBytes: parsed.data.fileSizeBytes,
          uploadedByUserId: req.user.id,
        });
        res.status(201).json(row);
      } catch (error: any) {
        console.error("[attachments] invoice create failed:", error);
        res.status(error?.statusCode || 500).json({
          message: error?.message || "Failed to add attachment",
        });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/attachments/:attachmentId/download",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const invoice = await getInvoice(
          organizationId,
          req.params.workOrderId,
          req.params.invoiceId,
        );
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        const row = await getAttachmentById(organizationId, req.params.attachmentId);
        if (!row || row.invoiceId !== invoice.id) {
          return res.status(404).json({ message: "Attachment not found" });
        }
        await streamAttachment(res, organizationId, row.id);
      } catch (error) {
        console.error("[attachments] invoice download failed:", error);
        if (!res.headersSent) {
          res.status(404).json({ message: "Attachment not found" });
        }
      }
    },
  );

  app.delete(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/attachments/:attachmentId",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const organizationId = orgId(req);
        const invoice = await getInvoice(
          organizationId,
          req.params.workOrderId,
          req.params.invoiceId,
        );
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status !== "draft") {
          return res
            .status(409)
            .json({ message: "Invoice attachments are only editable in draft" });
        }
        const row = await getAttachmentById(organizationId, req.params.attachmentId);
        if (!row || row.invoiceId !== invoice.id) {
          return res.status(404).json({ message: "Attachment not found" });
        }
        await deleteAttachmentRefcounted(organizationId, row.id);
        res.status(204).send();
      } catch (error: any) {
        console.error("[attachments] invoice delete failed:", error);
        res.status(error?.statusCode || 500).json({
          message: error?.message || "Failed to delete attachment",
        });
      }
    },
  );
}
